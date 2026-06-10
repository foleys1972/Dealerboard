using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public sealed class CallRecordingService : ICallRecordingService
{
    private const int SampleRate = 48000;
    private const int Channels = 2;
    private const int BitsPerSample = 16;

    private const int FrameMs = 20;
    private const int BytesPerFrame = SampleRate * Channels * (BitsPerSample / 8) * FrameMs / 1000; // 3840

    private readonly ILogger<CallRecordingService> _logger;
    private readonly IConfigurationService _configService;
    private readonly IAuthService _authService;
    private readonly IAudioService _audioService;

    private readonly ConcurrentQueue<byte[]> _micQueue = new();
    private readonly ConcurrentQueue<byte[]> _speakerQueue = new();

    private readonly object _lock = new();

    private CancellationTokenSource? _cts;
    private Task? _writerLoop;
    private WaveFileWriter? _writer;

    private WasapiLoopbackCapture? _loopback;

    private readonly object _loopbackLock = new();
    private BufferedWaveProvider? _loopbackBufferedProvider;
    private IWaveProvider? _loopbackPcm16Provider;

    private DateTime _recordingStartUtc;
    private DateTime? _firstMicUtc;
    private DateTime? _firstLoopbackUtc;
    private int _writtenFrames;

    private Call? _call;
    private DateTime _startUtc;
    private string? _filePath;

    private byte[] _micBuffered = Array.Empty<byte>();
    private byte[] _speakerBuffered = Array.Empty<byte>();

    private string? _chunkSessionId;
    private int _chunkIndex;
    private DateTime _lastChunkFlushUtc;
    private List<byte> _chunkPcmBuffer = new();
    private Task? _chunkLoop;

    private int _uploadChunkSeconds = 20;
    private int _voiceVoxSilenceSeconds = 10;

    private const string SessionMetaFileName = "session_meta.json";
    private const string SessionEndedFileName = "session_ended.json";

    private sealed class RecordingSession
    {
        public readonly object Lock = new();

        public bool IsRecording;
        public CancellationTokenSource? Cts;

        public Call? Call;
        public DateTime StartUtc;
        public string? FilePath;
        public WaveFileWriter? Writer;

        public string? ChunkSessionId;
        public int ChunkIndex;
        public DateTime LastChunkFlushUtc;
        public List<byte> ChunkPcmBuffer = new();
        public Task? ChunkLoop;
    }

    private readonly ConcurrentDictionary<string, RecordingSession> _sessions = new(StringComparer.OrdinalIgnoreCase);

    public bool IsRecording { get; private set; }

    public bool IsRecordingSession(string sessionKey)
    {
        if (string.IsNullOrWhiteSpace(sessionKey)) return false;
        if (!_sessions.TryGetValue(sessionKey, out var s)) return false;
        lock (s.Lock)
        {
            return s.IsRecording;
        }
    }

    private async Task ChunkLoopAsync(string sessionKey, RecordingSession s, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(250, ct);

                Call? call;
                DateTime startUtc;
                lock (s.Lock)
                {
                    call = s.Call;
                    startUtc = s.StartUtc;
                }

                if (call == null) continue;

                await EnsureChunkSessionStartedAsync(sessionKey, s, call, startUtc, ct);

                string? sessionId;
                DateTime lastFlush;
                lock (s.Lock)
                {
                    sessionId = s.ChunkSessionId;
                    lastFlush = s.LastChunkFlushUtc;
                }

                if (string.IsNullOrWhiteSpace(sessionId)) continue;

                var now = DateTime.UtcNow;
                var flushSeconds = 1;
                if ((now - lastFlush).TotalSeconds < flushSeconds) continue;

                byte[] pcm;
                int index;
                lock (s.Lock)
                {
                    if (s.ChunkPcmBuffer.Count == 0)
                    {
                        s.LastChunkFlushUtc = now;
                        continue;
                    }

                    pcm = s.ChunkPcmBuffer.ToArray();
                    s.ChunkPcmBuffer.Clear();
                    s.LastChunkFlushUtc = now;
                    index = s.ChunkIndex++;
                }

                await SpoolAndUploadChunkAsync(sessionId, index, pcm, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Chunk loop error (session). sessionKey={SessionKey}", sessionKey);
            }
        }
    }

    public int VoiceVoxSilenceSeconds
    {
        get
        {
            lock (_lock)
            {
                return _voiceVoxSilenceSeconds;
            }

        }
    }

    private async Task EnsureChunkSessionStartedAsync(string sessionKey, RecordingSession s, Call call, DateTime startUtc, CancellationToken ct)
    {
        lock (s.Lock)
        {
            if (!string.IsNullOrWhiteSpace(s.ChunkSessionId)) return;
        }

        if (!string.IsNullOrWhiteSpace(_authService.AuthToken))
        {
            var cfg = await FetchRecordingClientConfigAsync(ct);
            lock (_lock)
            {
                _uploadChunkSeconds = cfg.UploadChunkSeconds;
                _voiceVoxSilenceSeconds = cfg.VoiceVoxSilenceSeconds;
            }
        }

        var sessionId = !string.IsNullOrWhiteSpace(call.Id)
            ? call.Id
            : $"wpf_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}";

        var dir = GetSessionSpoolDir(sessionId);
        Directory.CreateDirectory(dir);

        var meta = new
        {
            type = call.Type == CallType.Broadcast ? "broadcast" : (call.Type == CallType.Conference ? "group" : "direct"),
            callId = call.Id,
            groupId = call.GroupId,
            groupName = call.GroupName,
            lineName = call.LineName,
            callerId = call.CallerId,
            callerName = call.CallerName,
            targetId = call.TargetId,
            targetName = call.TargetName,
            participants = call.Participants ?? new List<string>(),
            speakers = call.Speakers ?? new List<string>(),
            startTime = startUtc,
            userId = _authService.CurrentUser?.Id,
            userName = _authService.CurrentUser?.Username,
            uploadedByUserId = _authService.CurrentUser?.Id,
            uploadedByUsername = _authService.CurrentUser?.Username,
            uploadedBy = _authService.CurrentUser?.Id,
            platform = "wpf",
            captureMethod = "client-pcm-chunks"
        };

        var payload = new
        {
            sessionId,
            meta,
            wav = new { sampleRate = SampleRate, channels = Channels, bitsPerSample = BitsPerSample }
        };

        try
        {
            var metaPath = Path.Combine(dir, SessionMetaFileName);
            await File.WriteAllTextAsync(metaPath, JsonSerializer.Serialize(payload), CancellationToken.None);
        }
        catch { }

        lock (s.Lock)
        {
            s.ChunkSessionId = sessionId;
        }

        if (string.IsNullOrWhiteSpace(_authService.AuthToken))
        {
            return;
        }

        using var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
        };

        using var client = new HttpClient(handler)
        {
            BaseAddress = new Uri(_configService.ServerUrl.TrimEnd('/')),
            Timeout = TimeSpan.FromSeconds(30)
        };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);

        var resp = await client.PostAsync(
            "/api/recordings/chunks/start",
            new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
            ct);

        if (!resp.IsSuccessStatusCode)
        {
            string body = string.Empty;
            try { body = await resp.Content.ReadAsStringAsync(ct); } catch { }
            _logger.LogWarning(
                "Chunk session start failed (session). status={Status} baseUrl={BaseUrl} body={Body} sessionKey={SessionKey}",
                resp.StatusCode,
                _configService.ServerUrl,
                body,
                sessionKey);
            return;
        }

        _logger.LogInformation(
            "Chunk session started on server (session). sessionId={SessionId} sessionKey={SessionKey} chunkSeconds={Seconds}",
            sessionId,
            sessionKey,
            _uploadChunkSeconds);
    }

    private Task StartSessionAsync(Call call, string sessionKey, CancellationToken cancellationToken)
    {
        var s = _sessions.GetOrAdd(sessionKey, _ => new RecordingSession());

        lock (s.Lock)
        {
            if (s.IsRecording)
            {
                // Update call reference (participants/speakers can change during VOX)
                if (s.Call != null && string.Equals(s.Call.Id, call.Id, StringComparison.OrdinalIgnoreCase))
                {
                    s.Call = call;
                }
                return Task.CompletedTask;
            }

            s.IsRecording = true;
            s.Call = call;
            s.StartUtc = DateTime.UtcNow;
            s.Cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

            s.ChunkSessionId = null;
            s.ChunkIndex = 0;
            s.LastChunkFlushUtc = DateTime.UtcNow;
            s.ChunkPcmBuffer = new List<byte>(BytesPerFrame * 50);

            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TradeCom",
                "Recordings");
            Directory.CreateDirectory(dir);

            var safeKey = sessionKey;
            var fileName = $"{DateTime.UtcNow:yyyyMMdd_HHmmss}_{safeKey}.wav";
            s.FilePath = Path.Combine(dir, fileName);

            var format = new WaveFormat(SampleRate, BitsPerSample, Channels);
            s.Writer = new WaveFileWriter(s.FilePath, format);

            s.ChunkLoop = Task.Run(() => ChunkLoopAsync(sessionKey, s, s.Cts.Token), s.Cts.Token);

            _logger.LogInformation(
                "Client recording session started. sessionKey={SessionKey} callId={CallId} path={Path}",
                sessionKey,
                call.Id,
                s.FilePath);

            return Task.CompletedTask;
        }
    }

    private async Task StopSessionAndUploadAsync(string reason, string sessionKey, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sessionKey)) return;

        if (!_sessions.TryGetValue(sessionKey, out var s))
        {
            return;
        }

        string? path;
        Call? call;
        DateTime startUtc;
        string? chunkSessionId;
        byte[] remainingPcm = Array.Empty<byte>();
        int remainingIndex = -1;

        lock (s.Lock)
        {
            if (!s.IsRecording)
            {
                return;
            }

            s.IsRecording = false;
            path = s.FilePath;
            call = s.Call;
            startUtc = s.StartUtc;
            chunkSessionId = s.ChunkSessionId;

            try
            {
                if (s.ChunkPcmBuffer.Count > 0)
                {
                    remainingPcm = s.ChunkPcmBuffer.ToArray();
                    s.ChunkPcmBuffer.Clear();
                    remainingIndex = s.ChunkIndex++;
                }
            }
            catch { }

            s.FilePath = null;
            s.Call = null;

            try { s.Cts?.Cancel(); } catch { }
        }

        try
        {
            if (s.ChunkLoop != null)
            {
                await s.ChunkLoop.WaitAsync(TimeSpan.FromSeconds(2), cancellationToken);
            }
        }
        catch { }

        lock (s.Lock)
        {
            try { s.Writer?.Flush(); } catch { }
            try { s.Writer?.Dispose(); } catch { }
            s.Writer = null;

            try { s.Cts?.Dispose(); } catch { }
            s.Cts = null;
            s.ChunkLoop = null;
        }

        if (!string.IsNullOrWhiteSpace(chunkSessionId))
        {
            try
            {
                if (remainingPcm.Length > 0 && remainingIndex >= 0)
                {
                    await SpoolAndUploadChunkAsync(chunkSessionId, remainingIndex, remainingPcm, cancellationToken);
                }

                var endedPath = Path.Combine(GetSessionSpoolDir(chunkSessionId), SessionEndedFileName);
                var ended = new { endUtc = DateTime.UtcNow, reason };
                await File.WriteAllTextAsync(endedPath, JsonSerializer.Serialize(ended), CancellationToken.None);
            }
            catch { }
        }

        if (string.IsNullOrWhiteSpace(path) || call == null)
        {
            return;
        }

        _logger.LogInformation(
            "Starting recording upload (session). sessionKey={SessionKey} callId={CallId} type={Type} reason={Reason} path={Path}",
            sessionKey,
            call.Id,
            call.Type,
            reason,
            path);

        try
        {
            var finalized = await TryFinalizeChunkedAsync(call, startUtc, DateTime.UtcNow, reason, chunkSessionId, sessionKey, cancellationToken);
            if (!finalized)
            {
                await UploadAsync(path, call, startUtc, DateTime.UtcNow, reason, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Recording upload failed (session). path={Path} callId={CallId} sessionKey={SessionKey} reason={Reason}", path, call.Id, sessionKey, reason);
        }
    }

    public CallRecordingService(
        ILogger<CallRecordingService> logger,
        IConfigurationService configService,
        IAuthService authService,
        IAudioService audioService)
    {
        _logger = logger;
        _configService = configService;
        _authService = authService;
        _audioService = audioService;
    }

    public async Task RefreshClientConfigAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_authService.AuthToken))
            {
                return;
            }

            var cfg = await FetchRecordingClientConfigAsync(cancellationToken);
            lock (_lock)
            {
                _uploadChunkSeconds = cfg.UploadChunkSeconds;
                _voiceVoxSilenceSeconds = cfg.VoiceVoxSilenceSeconds;
            }
        }
        catch
        {
        }
    }

    public async Task ReconcilePendingUploadsAsync(CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_authService.AuthToken))
        {
            return;
        }

        string root;
        try
        {
            root = GetSpoolRoot();
        }
        catch
        {
            return;
        }

        if (!Directory.Exists(root))
        {
            return;
        }

        foreach (var dir in Directory.GetDirectories(root))
        {
            cancellationToken.ThrowIfCancellationRequested();

            var sessionId = Path.GetFileName(dir);
            if (string.IsNullOrWhiteSpace(sessionId)) continue;

            try
            {
                var metaPath = Path.Combine(dir, SessionMetaFileName);
                if (!File.Exists(metaPath))
                {
                    continue;
                }
                var payloadJson = await File.ReadAllTextAsync(metaPath, cancellationToken);
                if (string.IsNullOrWhiteSpace(payloadJson)) continue;

                using var handler = new HttpClientHandler
                {
                    ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
                };

                using var client = new HttpClient(handler)
                {
                    BaseAddress = new Uri(_configService.ServerUrl.TrimEnd('/')),
                    Timeout = TimeSpan.FromMinutes(2)
                };
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);

                try
                {
                    var startResp = await client.PostAsync(
                        "/api/recordings/chunks/start",
                        new StringContent(payloadJson, Encoding.UTF8, "application/json"),
                        cancellationToken);
                    if (!startResp.IsSuccessStatusCode)
                    {
                        string body = string.Empty;
                        try { body = await startResp.Content.ReadAsStringAsync(cancellationToken); } catch { }
                        _logger.LogWarning(
                            "Reconcile: start failed. status={Status} baseUrl={BaseUrl} sessionId={SessionId} body={Body}",
                            startResp.StatusCode,
                            _configService.ServerUrl,
                            sessionId,
                            body);
                    }
                }
                catch { }

                List<int> received = new();
                bool finalized = false;
                try
                {
                    var statusResp = await client.GetAsync($"/api/recordings/chunks/{sessionId}/status", cancellationToken);
                    if (statusResp.IsSuccessStatusCode)
                    {
                        var json = await statusResp.Content.ReadAsStringAsync(cancellationToken);
                        using var doc = JsonDocument.Parse(json);
                        finalized = doc.RootElement.TryGetProperty("finalized", out var finEl) && finEl.GetBoolean();
                        if (doc.RootElement.TryGetProperty("receivedChunkIndexes", out var arr) && arr.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var el in arr.EnumerateArray())
                            {
                                if (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var idx))
                                {
                                    received.Add(idx);
                                }
                            }
                        }
                    }
                    else
                    {
                        string body = string.Empty;
                        try { body = await statusResp.Content.ReadAsStringAsync(cancellationToken); } catch { }
                        _logger.LogWarning(
                            "Reconcile: status failed. status={Status} baseUrl={BaseUrl} sessionId={SessionId} body={Body}",
                            statusResp.StatusCode,
                            _configService.ServerUrl,
                            sessionId,
                            body);
                    }
                }
                catch { }

                if (finalized)
                {
                    try { Directory.Delete(dir, recursive: true); } catch { }
                    continue;
                }

                var receivedSet = new HashSet<int>(received);

                foreach (var chunkFile in Directory.GetFiles(dir, "chunk_*.bin.dpapi"))
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    var fileName = Path.GetFileName(chunkFile);
                    var digits = new string(fileName
                        .SkipWhile(c => c != '_')
                        .Skip(1)
                        .TakeWhile(char.IsDigit)
                        .ToArray());
                    if (!int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var idx))
                    {
                        continue;
                    }

                    if (receivedSet.Contains(idx))
                    {
                        var uploadedPath = chunkFile + ".uploaded";
                        try { File.Move(chunkFile, uploadedPath, overwrite: true); } catch { }
                        continue;
                    }

                    await TryUploadSpoolChunkAsync(sessionId, idx, chunkFile, cancellationToken);
                }

                foreach (var uploaded in Directory.GetFiles(dir, "chunk_*.bin.dpapi.uploaded"))
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    var fileName = Path.GetFileName(uploaded);
                    var coreName = fileName.Replace(".uploaded", "", StringComparison.OrdinalIgnoreCase);
                    var digits = new string(coreName
                        .SkipWhile(c => c != '_')
                        .Skip(1)
                        .TakeWhile(char.IsDigit)
                        .ToArray());
                    if (!int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out var idx))
                    {
                        continue;
                    }

                    if (receivedSet.Contains(idx))
                    {
                        continue;
                    }

                    await TryUploadSpoolChunkAsync(sessionId, idx, uploaded, cancellationToken);
                }

                var endedMarker = Path.Combine(dir, SessionEndedFileName);
                var shouldFinalize = File.Exists(endedMarker);

                if (!shouldFinalize)
                {
                    try
                    {
                        var lastWrite = Directory.GetLastWriteTimeUtc(dir);
                        if ((DateTime.UtcNow - lastWrite) > TimeSpan.FromSeconds(20))
                        {
                            shouldFinalize = true;
                        }
                    }
                    catch { }
                }

                if (shouldFinalize)
                {
                    try
                    {
                        var finResp = await client.PostAsync(
                            $"/api/recordings/chunks/{sessionId}/finalize",
                            new StringContent("{}", Encoding.UTF8, "application/json"),
                            cancellationToken);
                        if (finResp.IsSuccessStatusCode)
                        {
                            try { Directory.Delete(dir, recursive: true); } catch { }
                        }
                    }
                    catch { }
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch
            {
            }
        }
    }

    public async Task StartAsync(Call call, string? sessionKey = null, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(sessionKey))
        {
            await StartSessionAsync(call, sessionKey, cancellationToken);
            return;
        }

        var shouldStartMic = false;

        lock (_lock)
        {
            if (IsRecording)
            {
                // If already recording, update the call reference to reflect current state
                // This ensures voice->video transitions maintain the same recording with updated call info
                if (_call != null && string.Equals(_call.Id, call.Id, StringComparison.OrdinalIgnoreCase))
                {
                    _call = call; // Update call reference (e.g., EnableVideo flag may have changed)
                    _logger.LogDebug("Recording already in progress for call {CallId}, updated call reference", call.Id);
                }
                return;
            }

            IsRecording = true;
            _call = call;
            _startUtc = DateTime.UtcNow;
            _recordingStartUtc = _startUtc;
            _firstMicUtc = null;
            _firstLoopbackUtc = null;
            _writtenFrames = 0;
            _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

            _chunkSessionId = null;
            _chunkIndex = 0;
            _lastChunkFlushUtc = DateTime.UtcNow;
            _chunkPcmBuffer = new List<byte>(BytesPerFrame * 50);

            _micBuffered = Array.Empty<byte>();
            _speakerBuffered = Array.Empty<byte>();

            while (_micQueue.TryDequeue(out _)) { }
            while (_speakerQueue.TryDequeue(out _)) { }

            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TradeCom",
                "Recordings");
            Directory.CreateDirectory(dir);

            var safeCallId = string.IsNullOrWhiteSpace(call.Id) ? "call" : call.Id;
            var fileName = $"{DateTime.UtcNow:yyyyMMdd_HHmmss}_{safeCallId}.wav";
            _filePath = Path.Combine(dir, fileName);

            var format = new WaveFormat(SampleRate, BitsPerSample, Channels);
            _writer = new WaveFileWriter(_filePath, format);

            _audioService.AudioDataAvailable += OnMicPcm;
            _audioService.PlaybackAudioAvailable += OnSpeakerPcm;

            // Ensure microphone capture is running so AudioDataAvailable actually fires.
            // Start outside the lock to avoid deadlocks and to reduce initial audio clipping.
            shouldStartMic = true;

            // Capture system output so far-end audio is recorded even when WebView2 plays directly to the device.
            // Best-effort: if loopback capture fails, we still record mic-only.
            try
            {
                _loopback = new WasapiLoopbackCapture();
                _loopback.DataAvailable += OnLoopbackDataAvailable;
                _loopback.RecordingStopped += (_, _) => { };

                try
                {
                    var wf = _loopback.WaveFormat;
                    if (wf.Channels != Channels)
                    {
                        throw new NotSupportedException($"Loopback channel count {wf.Channels} is not supported (expected {Channels})");
                    }
                    var buffered = new BufferedWaveProvider(wf)
                    {
                        DiscardOnBufferOverflow = true,
                        ReadFully = false
                    };

                    var sampleProvider = buffered.ToSampleProvider();
                    if (wf.SampleRate != SampleRate)
                    {
                        sampleProvider = new WdlResamplingSampleProvider(sampleProvider, SampleRate);
                    }

                    var wave16 = new SampleToWaveProvider16(sampleProvider);
                    lock (_loopbackLock)
                    {
                        _loopbackBufferedProvider = buffered;
                        _loopbackPcm16Provider = wave16;
                    }
                }
                catch
                {
                    lock (_loopbackLock)
                    {
                        _loopbackBufferedProvider = null;
                        _loopbackPcm16Provider = null;
                    }
                }

                _loopback.StartRecording();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to start loopback capture for recording");
                try { _loopback?.Dispose(); } catch { }
                _loopback = null;

                lock (_loopbackLock)
                {
                    _loopbackBufferedProvider = null;
                    _loopbackPcm16Provider = null;
                }
            }

            _writerLoop = Task.Run(() => WriterLoopAsync(_cts.Token), _cts.Token);

            // Background loop to flush PCM into encrypted spool + upload.
            _chunkLoop = Task.Run(() => ChunkLoopAsync(_cts.Token), _cts.Token);

            _logger.LogInformation("Client recording started. callId={CallId} path={Path}", call.Id, _filePath);
            // fall-through
        }

        try
        {
            _logger.LogInformation("Recording start timing. callId={CallId} startUtc={StartUtc:O}", call.Id, _recordingStartUtc);
        }
        catch { }

        if (shouldStartMic)
        {
            try
            {
                await _audioService.InitializeAsync();
                await _audioService.StartRecordingAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to start microphone capture for recording");
            }
        }

        return;
    }

    public Task AppendPcmAsync(string sessionKey, byte[] pcm, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sessionKey)) return Task.CompletedTask;
        if (pcm == null || pcm.Length == 0) return Task.CompletedTask;

        if (!_sessions.TryGetValue(sessionKey, out var s))
        {
            return Task.CompletedTask;
        }

        lock (s.Lock)
        {
            if (!s.IsRecording) return Task.CompletedTask;

            try
            {
                s.Writer?.Write(pcm, 0, pcm.Length);
            }
            catch { }

            try
            {
                if (s.ChunkPcmBuffer.Count == 0)
                {
                    s.ChunkPcmBuffer = new List<byte>(BytesPerFrame * 50);
                }
                s.ChunkPcmBuffer.AddRange(pcm);
            }
            catch { }
        }

        return Task.CompletedTask;
    }

    public async Task StopAndUploadAsync(string reason, string? sessionKey = null, CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(sessionKey))
        {
            await StopSessionAndUploadAsync(reason, sessionKey, cancellationToken);
            return;
        }

        string? path;
        Call? call;
        DateTime startUtc;

        lock (_lock)
        {
            if (!IsRecording)
            {
                _logger.LogDebug("StopAndUploadAsync called but IsRecording=false, reason={Reason}", reason);
                return;
            }

            IsRecording = false;
            path = _filePath;
            call = _call;
            startUtc = _startUtc;

            _filePath = null;
            _call = null;

            try { _audioService.AudioDataAvailable -= OnMicPcm; } catch { }
            try { _audioService.PlaybackAudioAvailable -= OnSpeakerPcm; } catch { }

            try
            {
                if (_loopback != null)
                {
                    _loopback.DataAvailable -= OnLoopbackDataAvailable;
                    _loopback.StopRecording();
                    _loopback.Dispose();
                    _loopback = null;
                }
            }
            catch { }

            lock (_loopbackLock)
            {
                _loopbackBufferedProvider = null;
                _loopbackPcm16Provider = null;
            }

            try { _cts?.Cancel(); } catch { }
        }

        try
        {
            if (_writerLoop != null)
            {
                await _writerLoop.WaitAsync(TimeSpan.FromSeconds(2), cancellationToken);
            }
        }
        catch { }

        lock (_lock)
        {
            try { _writer?.Flush(); } catch { }
            try { _writer?.Dispose(); } catch { }
            _writer = null;

            try { _cts?.Dispose(); } catch { }
            _cts = null;
            _writerLoop = null;
            _chunkLoop = null;
        }

        if (string.IsNullOrWhiteSpace(path) || call == null)
        {
            _logger.LogWarning("StopAndUploadAsync: Cannot upload - path={Path}, call={Call}, reason={Reason}", 
                string.IsNullOrWhiteSpace(path) ? "null/empty" : path, 
                call == null ? "null" : call.Id, 
                reason);
            return;
        }

        _logger.LogInformation("Starting recording upload. callId={CallId} type={Type} reason={Reason} path={Path}", 
            call.Id, call.Type, reason, path);

        try
        {
            try
            {
                var sid = _chunkSessionId;
                if (!string.IsNullOrWhiteSpace(sid))
                {
                    var endedPath = Path.Combine(GetSessionSpoolDir(sid), SessionEndedFileName);
                    var ended = new { endUtc = DateTime.UtcNow, reason };
                    await File.WriteAllTextAsync(endedPath, JsonSerializer.Serialize(ended), CancellationToken.None);
                }
            }
            catch { }

            // First try chunked finalize (preferred)
            var finalized = await TryFinalizeChunkedAsync(call, startUtc, DateTime.UtcNow, reason, cancellationToken);
            if (!finalized)
            {
                // Fallback to legacy full-file upload to avoid data loss.
                await UploadAsync(path, call, startUtc, DateTime.UtcNow, reason, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Recording upload failed. path={Path} callId={CallId} reason={Reason}", path, call.Id, reason);
        }
    }

    private string GetSpoolRoot()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TradeCom",
            "RecordingSpool");
    }

    private string GetSessionSpoolDir(string sessionId)
    {
        return Path.Combine(GetSpoolRoot(), sessionId);
    }

    private static byte[] Protect(byte[] data)
    {
        return ProtectedData.Protect(data, null, DataProtectionScope.CurrentUser);
    }

    private static byte[] Unprotect(byte[] data)
    {
        return ProtectedData.Unprotect(data, null, DataProtectionScope.CurrentUser);
    }

    private async Task<(int UploadChunkSeconds, int VoiceVoxSilenceSeconds)> FetchRecordingClientConfigAsync(CancellationToken ct)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_authService.AuthToken)) return (20, 10);

            using var handler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
            };

            using var client = new HttpClient(handler)
            {
                BaseAddress = new Uri(_configService.ServerUrl.TrimEnd('/')),
                Timeout = TimeSpan.FromSeconds(15)
            };

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);
            var resp = await client.GetAsync("/api/recordings/client-config", ct);
            if (!resp.IsSuccessStatusCode) return (20, 10);

            var json = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("recordings", out var rec)) return (20, 10);

            int uploadSeconds = 20;
            try
            {
                if (rec.TryGetProperty("uploadChunkSeconds", out var secEl))
                {
                    uploadSeconds = secEl.GetInt32();
                }
            }
            catch { }
            if (uploadSeconds < 10) uploadSeconds = 10;
            if (uploadSeconds > 30) uploadSeconds = 30;

            int voxSeconds = 10;
            try
            {
                if (rec.TryGetProperty("voiceVoxSilenceSeconds", out var voxEl))
                {
                    voxSeconds = voxEl.GetInt32();
                }
            }
            catch { }
            if (voxSeconds < 1) voxSeconds = 1;
            if (voxSeconds > 120) voxSeconds = 120;

            return (uploadSeconds, voxSeconds);
        }
        catch
        {
            return (20, 10);
        }
    }

    private async Task EnsureChunkSessionStartedAsync(Call call, DateTime startUtc, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(_chunkSessionId)) return;

        if (!string.IsNullOrWhiteSpace(_authService.AuthToken))
        {
            var cfg = await FetchRecordingClientConfigAsync(ct);
            lock (_lock)
            {
                _uploadChunkSeconds = cfg.UploadChunkSeconds;
                _voiceVoxSilenceSeconds = cfg.VoiceVoxSilenceSeconds;
            }
        }

        // Use the call id as the recording session id so both endpoints converge on the same
        // session identifier (MiFID consistency and faster end-call coordination).
        // Fall back to a random id only when call.Id is missing.
        var sessionId = !string.IsNullOrWhiteSpace(call.Id)
            ? call.Id
            : $"wpf_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}";
        var dir = GetSessionSpoolDir(sessionId);
        Directory.CreateDirectory(dir);

        var meta = new
        {
            type = call.Type == CallType.Broadcast ? "broadcast" : (call.Type == CallType.Conference ? "group" : "direct"),
            callId = call.Id,
            groupId = call.GroupId,
            groupName = call.GroupName,
            lineName = call.LineName,
            callerId = call.CallerId,
            callerName = call.CallerName,
            targetId = call.TargetId,
            targetName = call.TargetName,
            participants = call.Participants ?? new List<string>(),
            speakers = call.Speakers ?? new List<string>(),
            startTime = startUtc,
            userId = _authService.CurrentUser?.Id,
            userName = _authService.CurrentUser?.Username,
            platform = "wpf",
            captureMethod = "client-pcm-chunks"
        };

        var payload = new
        {
            sessionId,
            meta,
            wav = new { sampleRate = SampleRate, channels = Channels, bitsPerSample = BitsPerSample }
        };
        try
        {
            var metaPath = Path.Combine(dir, SessionMetaFileName);
            await File.WriteAllTextAsync(metaPath, JsonSerializer.Serialize(payload), CancellationToken.None);
        }
        catch { }

        // Always proceed with local spooling/uploads using this session id.
        // Server-side chunk session start can fail transiently (or due to env mismatches),
        // but we still want chunks to upload and reconcile.
        _chunkSessionId = sessionId;

        // If we're offline / unauthenticated, we still spool locally under this session id.
        if (string.IsNullOrWhiteSpace(_authService.AuthToken))
        {
            return;
        }

        using var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
        };

        using var client = new HttpClient(handler)
        {
            BaseAddress = new Uri(_configService.ServerUrl.TrimEnd('/')),
            Timeout = TimeSpan.FromSeconds(30)
        };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);

        var resp = await client.PostAsync(
            "/api/recordings/chunks/start",
            new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
            ct);

        if (!resp.IsSuccessStatusCode)
        {
            string body = string.Empty;
            try { body = await resp.Content.ReadAsStringAsync(ct); } catch { }
            _logger.LogWarning(
                "Chunk session start failed. status={Status} baseUrl={BaseUrl} body={Body}",
                resp.StatusCode,
                _configService.ServerUrl,
                body);
            return;
        }

        // Prefer the server-provided sessionId (lets the server rotate ids to avoid reuse).
        string serverSessionId = sessionId;
        try
        {
            var json = await resp.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("sessionId", out var sidEl) && sidEl.ValueKind == JsonValueKind.String)
            {
                var s = sidEl.GetString();
                if (!string.IsNullOrWhiteSpace(s)) serverSessionId = s;
            }
        }
        catch { }

        if (!string.Equals(serverSessionId, sessionId, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var serverDir = GetSessionSpoolDir(serverSessionId);
                Directory.CreateDirectory(serverDir);

                var serverPayload = new
                {
                    sessionId = serverSessionId,
                    meta,
                    wav = new { sampleRate = SampleRate, channels = Channels, bitsPerSample = BitsPerSample }
                };
                var serverMetaPath = Path.Combine(serverDir, SessionMetaFileName);
                await File.WriteAllTextAsync(serverMetaPath, JsonSerializer.Serialize(serverPayload), CancellationToken.None);
            }
            catch { }
        }

        _logger.LogInformation("Chunk session started on server. sessionId={SessionId} chunkSeconds={Seconds}", sessionId, _uploadChunkSeconds);
    }

    private async Task ChunkLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(250, ct);

                Call? call;
                DateTime startUtc;
                lock (_lock)
                {
                    call = _call;
                    startUtc = _startUtc;
                }

                if (!IsRecording || call == null) continue;

                await EnsureChunkSessionStartedAsync(call, startUtc, ct);
                if (string.IsNullOrWhiteSpace(_chunkSessionId)) continue;

                var now = DateTime.UtcNow;
                var flushSeconds = 1;
                if ((now - _lastChunkFlushUtc).TotalSeconds < flushSeconds) continue;

                byte[] pcm;
                int index;
                lock (_lock)
                {
                    if (_chunkPcmBuffer.Count == 0)
                    {
                        _lastChunkFlushUtc = now;
                        continue;
                    }

                    pcm = _chunkPcmBuffer.ToArray();
                    _chunkPcmBuffer.Clear();
                    _lastChunkFlushUtc = now;
                    index = _chunkIndex++;
                }

                await SpoolAndUploadChunkAsync(_chunkSessionId, index, pcm, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Chunk loop error");
            }
        }
    }

    private async Task SpoolAndUploadChunkAsync(string sessionId, int index, byte[] pcm, CancellationToken ct)
    {
        try
        {
            var dir = GetSessionSpoolDir(sessionId);
            Directory.CreateDirectory(dir);

            var protectedBytes = Protect(pcm);
            var fileName = $"chunk_{index:D6}.bin.dpapi";
            var filePath = Path.Combine(dir, fileName);
            await File.WriteAllBytesAsync(filePath, protectedBytes, CancellationToken.None);

            await TryUploadSpoolChunkAsync(sessionId, index, filePath, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed spooling/uploading chunk {Index}", index);
        }
    }

    private async Task<bool> TryUploadSpoolChunkAsync(string sessionId, int index, string protectedFilePath, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_authService.AuthToken)) return false;
        if (!File.Exists(protectedFilePath)) return false;

        try
        {
            var protectedBytes = await File.ReadAllBytesAsync(protectedFilePath, ct);
            var pcm = Unprotect(protectedBytes);

            using var handler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
            };

            using var client = new HttpClient(handler)
            {
                BaseAddress = new Uri(_configService.ServerUrl.TrimEnd('/')),
                Timeout = TimeSpan.FromMinutes(2)
            };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);

            using var form = new MultipartFormDataContent();
            using var content = new ByteArrayContent(pcm);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            form.Add(content, "chunk", $"chunk_{index:D6}.bin");
            form.Add(new StringContent(index.ToString()), "index");

            var resp = await client.PostAsync($"/api/recordings/chunks/{sessionId}/chunk", form, ct);
            if (!resp.IsSuccessStatusCode)
            {
                return false;
            }

            // Mark uploaded by renaming
            var uploadedPath = protectedFilePath + ".uploaded";
            try { File.Move(protectedFilePath, uploadedPath, overwrite: true); } catch { }
            return true;
        }
        catch
        {
            return false;
        }
    }

    private async Task<bool> TryFinalizeChunkedAsync(Call call, DateTime startUtc, DateTime endUtc, string reason, CancellationToken ct)
    {
        var sessionId = _chunkSessionId;
        if (string.IsNullOrWhiteSpace(sessionId)) return false;
        if (string.IsNullOrWhiteSpace(_authService.AuthToken)) return false;

        try
        {
            // Flush remaining buffer as final chunk
            byte[] remaining;
            int index;
            lock (_lock)
            {
                remaining = _chunkPcmBuffer.Count > 0 ? _chunkPcmBuffer.ToArray() : Array.Empty<byte>();
                _chunkPcmBuffer.Clear();
                index = _chunkIndex++;
            }
            if (remaining.Length > 0)
            {
                await SpoolAndUploadChunkAsync(sessionId, index, remaining, ct);
            }

            // Best-effort upload any not-yet-uploaded chunks from spool.
            var dir = GetSessionSpoolDir(sessionId);
            if (Directory.Exists(dir))
            {
                foreach (var file in Directory.GetFiles(dir, "chunk_*.bin.dpapi"))
                {
                    var name = Path.GetFileName(file);
                    var digits = new string(name.SkipWhile(c => c != '_').Skip(1).TakeWhile(char.IsDigit).ToArray());
                    if (int.TryParse(digits, out var idx))
                    {
                        await TryUploadSpoolChunkAsync(sessionId, idx, file, ct);
                    }
                }
            }

            using var handler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
            };

            using var client = new HttpClient(handler)
            {
                BaseAddress = new Uri(_configService.ServerUrl.TrimEnd('/')),
                Timeout = TimeSpan.FromMinutes(2)
            };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);

            var resp = await client.PostAsync($"/api/recordings/chunks/{sessionId}/finalize", new StringContent("{}", Encoding.UTF8, "application/json"), ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogWarning("Chunked finalize failed: {Status} {Body}", resp.StatusCode, body);
                return false;
            }

            // Cleanup spool on success
            try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); } catch { }
            _logger.LogInformation("Chunked finalize succeeded. sessionId={SessionId}", sessionId);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Chunked finalize failed unexpectedly");
            return false;
        }
    }

    private async Task<bool> TryFinalizeChunkedAsync(
        Call call,
        DateTime startUtc,
        DateTime endUtc,
        string reason,
        string? sessionId,
        string sessionKey,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return false;
        if (string.IsNullOrWhiteSpace(_authService.AuthToken)) return false;

        try
        {
            var dir = GetSessionSpoolDir(sessionId);
            if (Directory.Exists(dir))
            {
                foreach (var file in Directory.GetFiles(dir, "chunk_*.bin.dpapi"))
                {
                    var name = Path.GetFileName(file);
                    var digits = new string(name.SkipWhile(c => c != '_').Skip(1).TakeWhile(char.IsDigit).ToArray());
                    if (int.TryParse(digits, out var idx))
                    {
                        await TryUploadSpoolChunkAsync(sessionId, idx, file, ct);
                    }
                }
            }

            using var handler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
            };

            using var client = new HttpClient(handler)
            {
                BaseAddress = new Uri(_configService.ServerUrl.TrimEnd('/')),
                Timeout = TimeSpan.FromMinutes(2)
            };
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);

            var resp = await client.PostAsync($"/api/recordings/chunks/{sessionId}/finalize", new StringContent("{}", Encoding.UTF8, "application/json"), ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogWarning(
                    "Chunked finalize failed (session): {Status} {Body} sessionKey={SessionKey}",
                    resp.StatusCode,
                    body,
                    sessionKey);
                return false;
            }

            try { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); } catch { }
            _logger.LogInformation("Chunked finalize succeeded (session). sessionId={SessionId} sessionKey={SessionKey}", sessionId, sessionKey);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Chunked finalize failed unexpectedly (session). sessionKey={SessionKey}", sessionKey);
            return false;
        }
    }

    private void OnMicPcm(object? sender, byte[] pcm)
    {
        if (!IsRecording || pcm == null || pcm.Length == 0) return;
        try
        {
            if (_firstMicUtc == null)
            {
                _firstMicUtc = DateTime.UtcNow;
                _logger.LogInformation("Recording first MIC PCM. deltaMs={DeltaMs} bytes={Bytes}", (int)(_firstMicUtc.Value - _recordingStartUtc).TotalMilliseconds, pcm.Length);
            }
        }
        catch { }
        _micQueue.Enqueue((byte[])pcm.Clone());
    }

    private void OnSpeakerPcm(object? sender, byte[] pcm)
    {
        if (!IsRecording || pcm == null || pcm.Length == 0) return;
        _speakerQueue.Enqueue((byte[])pcm.Clone());
    }

    private void OnLoopbackDataAvailable(object? sender, WaveInEventArgs e)
    {
        try
        {
            if (!IsRecording || e.BytesRecorded <= 0 || e.Buffer == null)
            {
                return;
            }
            BufferedWaveProvider? buffered;
            lock (_loopbackLock)
            {
                buffered = _loopbackBufferedProvider;
            }

            if (buffered == null)
            {
                return;
            }

            if (_firstLoopbackUtc == null)
            {
                _firstLoopbackUtc = DateTime.UtcNow;
                try
                {
                    _logger.LogInformation(
                        "Recording first LOOPBACK PCM. deltaMs={DeltaMs} bytes={Bytes} wf={Wf}",
                        (int)(_firstLoopbackUtc.Value - _recordingStartUtc).TotalMilliseconds,
                        e.BytesRecorded,
                        buffered.WaveFormat);
                }
                catch { }
            }

            var bytesToCopy = Math.Min(e.BytesRecorded, e.Buffer.Length);
            if (bytesToCopy <= 0)
            {
                return;
            }

            buffered.AddSamples(e.Buffer, 0, bytesToCopy);
        }
        catch { }
    }

    private async Task WriterLoopAsync(CancellationToken ct)
    {
        var lastLog = DateTime.UtcNow;
        var silence = new byte[BytesPerFrame];
        var nextDue = DateTime.UtcNow;

        while (!ct.IsCancellationRequested)
        {
            try
            {
                // Fixed 20ms pacing: always write one 20ms frame per tick.
                // If there is insufficient audio buffered yet, write silence so the WAV timeline matches real time.
                byte[] frame = BuildMixedFrame() ?? silence;

                lock (_lock)
                {
                    _writer?.Write(frame, 0, frame.Length);
                }

                _writtenFrames++;

                if ((DateTime.UtcNow - lastLog) > TimeSpan.FromSeconds(2))
                {
                    lastLog = DateTime.UtcNow;
                    _logger.LogInformation(
                        "Recording writer stats. frames={Frames} elapsedMs={ElapsedMs} micQ={MicQ} spkQ={SpkQ} micBuf={MicBuf} spkBuf={SpkBuf}",
                        _writtenFrames,
                        (int)(DateTime.UtcNow - _recordingStartUtc).TotalMilliseconds,
                        _micQueue.Count,
                        _speakerQueue.Count,
                        _micBuffered.Length,
                        _speakerBuffered.Length);
                }

                nextDue = nextDue.AddMilliseconds(FrameMs);
                var delay = nextDue - DateTime.UtcNow;
                if (delay > TimeSpan.Zero)
                {
                    await Task.Delay(delay, ct);
                }
                else
                {
                    // If we're behind (CPU stall), reset schedule so we don't spin writing bursts.
                    nextDue = DateTime.UtcNow;
                    await Task.Yield();
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Recording writer loop error");
                await Task.Delay(50, ct);
            }
        }
    }

    private byte[]? BuildMixedFrame()
    {
        // Accumulate mic bytes
        while (_micBuffered.Length < BytesPerFrame && _micQueue.TryDequeue(out var chunk))
        {
            _micBuffered = Concat(_micBuffered, chunk);
        }

        while (_speakerBuffered.Length < BytesPerFrame && _speakerQueue.TryDequeue(out var chunk))
        {
            _speakerBuffered = Concat(_speakerBuffered, chunk);
        }

        if (_speakerBuffered.Length < BytesPerFrame)
        {
            IWaveProvider? loopbackProvider;
            lock (_loopbackLock)
            {
                loopbackProvider = _loopbackPcm16Provider;
            }

            if (loopbackProvider != null)
            {
                var needed = BytesPerFrame - _speakerBuffered.Length;
                if (needed > 0)
                {
                    var tmp = new byte[needed];
                    var read = 0;
                    try { read = loopbackProvider.Read(tmp, 0, needed); } catch { read = 0; }

                    if (read > 0)
                    {
                        if (read != tmp.Length)
                        {
                            var actual = new byte[read];
                            Buffer.BlockCopy(tmp, 0, actual, 0, read);
                            _speakerBuffered = Concat(_speakerBuffered, actual);
                        }
                        else
                        {
                            _speakerBuffered = Concat(_speakerBuffered, tmp);
                        }
                    }
                }
            }
        }

        if (_micBuffered.Length < BytesPerFrame && _speakerBuffered.Length < BytesPerFrame)
        {
            return null;
        }

        var micFrame = TakeFrame(ref _micBuffered);
        var spkFrame = TakeFrame(ref _speakerBuffered);

        var outBuf = new byte[BytesPerFrame];

        // Mix stereo PCM 16-bit: out = clamp(mic + speaker)
        for (int i = 0; i + 1 < outBuf.Length; i += 2)
        {
            short mic = BitConverter.ToInt16(micFrame, i);
            short spk = BitConverter.ToInt16(spkFrame, i);
            int mixed = mic + spk;
            if (mixed > short.MaxValue) mixed = short.MaxValue;
            if (mixed < short.MinValue) mixed = short.MinValue;
            var bytes = BitConverter.GetBytes((short)mixed);
            outBuf[i] = bytes[0];
            outBuf[i + 1] = bytes[1];
        }

        // Feed the chunk buffer with raw PCM so the chunk uploader can spool + upload.
        // Keep this small/cheap: append bytes; the chunk loop periodically flushes.
        try
        {
            lock (_lock)
            {
                _chunkPcmBuffer.AddRange(outBuf);
            }
        }
        catch { }

        return outBuf;
    }

    private static byte[] Concat(byte[] a, byte[] b)
    {
        if (a.Length == 0) return b;
        if (b.Length == 0) return a;
        var result = new byte[a.Length + b.Length];
        Buffer.BlockCopy(a, 0, result, 0, a.Length);
        Buffer.BlockCopy(b, 0, result, a.Length, b.Length);
        return result;
    }

    private static byte[] TakeFrame(ref byte[] buffer)
    {
        if (buffer.Length < BytesPerFrame)
        {
            return new byte[BytesPerFrame];
        }

        var frame = new byte[BytesPerFrame];
        Buffer.BlockCopy(buffer, 0, frame, 0, BytesPerFrame);

        if (buffer.Length == BytesPerFrame)
        {
            buffer = Array.Empty<byte>();
        }
        else
        {
            var remaining = new byte[buffer.Length - BytesPerFrame];
            Buffer.BlockCopy(buffer, BytesPerFrame, remaining, 0, remaining.Length);
            buffer = remaining;
        }

        return frame;
    }

    private async Task UploadAsync(string filePath, Call call, DateTime startUtc, DateTime endUtc, string reason, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_authService.AuthToken))
        {
            _logger.LogWarning("Skipping recording upload: no AuthToken");
            return;
        }

        var durationMs = (long)Math.Max(0, (endUtc - startUtc).TotalMilliseconds);

        var meta = new
        {
            type = call.Type == CallType.Broadcast ? "broadcast" : (call.Type == CallType.Conference ? "group" : "direct"),
            callId = call.Id,
            groupId = call.GroupId,
            groupName = call.GroupName,
            lineName = call.LineName,
            callerId = call.CallerId,
            callerName = call.CallerName,
            targetId = call.TargetId,
            targetName = call.TargetName,
            participants = call.Participants ?? new List<string>(),
            speakers = call.Speakers ?? new List<string>(),
            startTime = startUtc,
            endTime = endUtc,
            durationMs,
            reason,
            // Explicit uploader identity for "Sent By".
            // Do not rely on userId/userName for this, because those can be attribution/ownership fields.
            uploadedByUserId = _authService.CurrentUser?.Id,
            uploadedByUsername = _authService.CurrentUser?.Username,
            uploadedBy = _authService.CurrentUser?.Id,
            userId = _authService.CurrentUser?.Id,
            userName = _authService.CurrentUser?.Username,
            platform = "wpf",
            captureMethod = "client-wav"
        };

        using var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
        };

        using var client = new HttpClient(handler)
        {
            BaseAddress = new Uri(_configService.ServerUrl.TrimEnd('/')),
            Timeout = TimeSpan.FromMinutes(2)
        };

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _authService.AuthToken);

        var metaJson = JsonSerializer.Serialize(meta);

        static async Task<HttpResponseMessage> PostOnceAsync(HttpClient client, string url, string filePath, string metaJson, CancellationToken ct)
        {
            using var form = new MultipartFormDataContent();
            await using var fileStream = File.OpenRead(filePath);
            using var fileContent = new StreamContent(fileStream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
            form.Add(fileContent, "file", Path.GetFileName(filePath));
            form.Add(new StringContent(metaJson, Encoding.UTF8, "application/json"), "metadata");
            return await client.PostAsync(url, form, ct);
        }

        var resp = await PostOnceAsync(client, "/api/recordings/upload", filePath, metaJson, ct);
        if (resp.StatusCode == HttpStatusCode.NotFound)
        {
            resp.Dispose();
            resp = await PostOnceAsync(client, "/recordings/upload", filePath, metaJson, ct);
        }

        if (!resp.IsSuccessStatusCode)
        {
            var body = await resp.Content.ReadAsStringAsync(ct);
            throw new HttpRequestException($"Recording upload failed: {(int)resp.StatusCode} {resp.ReasonPhrase}: {body}");
        }

        _logger.LogInformation("Recording uploaded successfully. callId={CallId} file={File}", call.Id, filePath);
    }
}
