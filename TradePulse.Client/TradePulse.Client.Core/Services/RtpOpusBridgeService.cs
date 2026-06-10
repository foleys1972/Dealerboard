using System.Buffers.Binary;
using System.Linq;
using System.Net;
using System.Net.Http.Headers;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using Concentus.Enums;
using Concentus.Structs;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public sealed class RtpOpusBridgeService : IRtpBridgeService, IDisposable
{
    private const int OpusSampleRate = 48000;
    private const int OpusFrameMs = 20;
    private const int SamplesPerChannelPerFrame = OpusSampleRate * OpusFrameMs / 1000; // 960
    private const int UplinkOpusChannels = 2;
    private const int UplinkPcmBytesPerFrame = SamplesPerChannelPerFrame * UplinkOpusChannels * sizeof(short); // 3840

    private const byte RtpVersion = 2;
    private const byte DefaultPayloadTypeOpus = 111;
    private byte _payloadType = DefaultPayloadTypeOpus;

    private readonly ILogger<RtpOpusBridgeService> _logger;
    private readonly IConfigurationService _configService;
    private readonly IAuthService _authService;
    private readonly IAudioService _audioService;

    private readonly object _lock = new();
    private readonly SemaphoreSlim _lifecycleSemaphore = new(1, 1);

    private bool _disposed;
    private bool _isRunning;
    private string? _callId;

    private HttpClient? _httpClient;

    // Uplink (mic -> server)
    private UdpClient? _uplinkUdp;
    private IPEndPoint? _uplinkTarget;
    private OpusEncoder? _opusEncoder;
    private uint _ssrc;
    private ushort _seq;
    private uint _timestamp;
    private readonly byte[] _pcmBuffer = new byte[UplinkPcmBytesPerFrame * 4];
    private int _pcmBuffered;

    // Downlink (server -> speaker)
    private UdpClient? _downlinkUdp;
    private Task? _downlinkLoop;
    private Task? _downlinkWatchdog;
    private CancellationTokenSource? _cts;
    private OpusDecoder? _opusDecoder;

    // The downlink Opus channel count can be mono (1) or stereo (2) depending on router RTP capabilities.
    // MediaSoup commonly uses mono for voice streams.
    private int _downlinkOpusChannels = 2;

    private DateTime _lastDownlinkPacketUtc = DateTime.MinValue;
    private int _downlinkRestartInProgress;

    // MediaSoup IDs
    private string? _uplinkTransportId;
    private string? _uplinkProducerId;
    private string? _downlinkTransportId;
    private string? _downlinkConsumerId;

    private bool _enableUplink;
    private bool _enableDownlink;

    public bool IsRunning => _isRunning;

    public RtpOpusBridgeService(
        ILogger<RtpOpusBridgeService> logger,
        IConfigurationService configService,
        IAuthService authService,
        IAudioService audioService)
    {
        _logger = logger;
        _configService = configService;
        _authService = authService;
        _audioService = audioService;
    }

    public async Task StartAsync(string callId, CancellationToken cancellationToken = default)
    {
        await StartInternalAsync(callId, enableUplink: true, enableDownlink: true, cancellationToken);
    }

    public async Task StartReceiveOnlyAsync(string callId, CancellationToken cancellationToken = default)
    {
        await StartInternalAsync(callId, enableUplink: false, enableDownlink: true, cancellationToken);
    }

    private async Task StartInternalAsync(string callId, bool enableUplink, bool enableDownlink, CancellationToken cancellationToken)
    {
        await _lifecycleSemaphore.WaitAsync(cancellationToken);
        try
        {
            bool alreadyRunning;
            bool sameCall;
            bool needStartNew;
            bool needStartUplink;
            bool needStopUplink;
            bool needEnsureDownlink;
            CancellationTokenSource? existingCts;

            lock (_lock)
            {
                alreadyRunning = _isRunning;
                sameCall = alreadyRunning && string.Equals(_callId, callId, StringComparison.OrdinalIgnoreCase);

                // If running on a different callId, we will stop and start fresh.
                needStartNew = !alreadyRunning || !sameCall;

                if (!alreadyRunning)
                {
                    _isRunning = true;
                    _callId = callId;
                    _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                }

                // Update desired mode.
                _enableUplink = enableUplink;
                _enableDownlink = enableDownlink;

                // Determine uplink transitions for same call.
                needStartUplink = sameCall && enableUplink && _uplinkUdp == null;
                needStopUplink = sameCall && !enableUplink && _uplinkUdp != null;
                needEnsureDownlink = enableDownlink;

                existingCts = _cts;
            }

            if (!needStartNew && sameCall)
            {
                // Switch modes without tearing down the downlink.
                if (needStopUplink)
                {
                    await StopUplinkOnlyAsync();
                }
                if (needStartUplink)
                {
                    await StartUplinkOnlyAsync(callId, existingCts?.Token ?? cancellationToken);
                }
                if (needEnsureDownlink)
                {
                    await EnsureDownlinkAsync(callId, existingCts?.Token ?? cancellationToken);
                }

                _logger.LogInformation("RTP bridge updated for callId={CallId} (uplink={Uplink} downlink={Downlink})", callId, enableUplink, enableDownlink);
                return;
            }

            // If we were running on a different callId, stop and start fresh.
            if (alreadyRunning && !sameCall)
            {
                await StopInternalAsync(CancellationToken.None);
                lock (_lock)
                {
                    _isRunning = true;
                    _callId = callId;
                    _enableUplink = enableUplink;
                    _enableDownlink = enableDownlink;
                    _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                }
            }

            try
            {
                if (string.IsNullOrWhiteSpace(_authService.AuthToken))
                {
                    throw new InvalidOperationException("Cannot start RTP bridge without AuthToken");
                }

                _httpClient = CreateHttpClient(_configService.ServerUrl, _authService.AuthToken);

                // Discover Opus payloadType from the router's RTP capabilities (per-group, with fallback).
                _payloadType = await DiscoverOpusPayloadTypeAsync(_httpClient, callId, _cts!.Token);

                // Discover Opus channels for correct decode (mono vs stereo).
                _downlinkOpusChannels = await DiscoverOpusChannelCountAsync(_httpClient, callId, _cts!.Token);

                if (enableUplink)
                {
                    await StartUplinkOnlyAsync(callId, _cts!.Token);
                }
                else
                {
                    _logger.LogInformation("RTP bridge started in receive-only mode. callId={CallId}", callId);
                }

                if (enableDownlink)
                {
                    await EnsureDownlinkAsync(callId, _cts!.Token);

                    // Ensure watchdog runs even if no producer exists yet (EnsureDownlinkAsync can return early).
                    _downlinkWatchdog ??= Task.Run(() => DownlinkWatchdogLoop(callId, _cts!.Token), _cts!.Token);
                }

                _logger.LogInformation("RTP bridge started for callId={CallId} (uplink={Uplink} downlink={Downlink})", callId, enableUplink, enableDownlink);
            }
            catch
            {
                await StopInternalAsync(CancellationToken.None);
                throw;
            }
        }
        finally
        {
            try { _lifecycleSemaphore.Release(); } catch { }
        }
    }

    private async Task StartUplinkOnlyAsync(string callId, CancellationToken ct)
    {
        if (_httpClient == null)
        {
            throw new InvalidOperationException("RTP bridge HTTP client not initialized");
        }

        if (_uplinkUdp != null)
        {
            return;
        }

        // 1) Create uplink PlainTransport (comedia=true so server learns our source from first RTP packet)
        var uplinkTransport = await PostJsonAsync<PlainTransportResponse>(
            _httpClient,
            "/api/webrtc/plain-transport",
            new { groupId = callId, comedia = true, rtcpMux = true },
            ct);

        if (uplinkTransport == null || string.IsNullOrWhiteSpace(uplinkTransport.Id))
        {
            throw new InvalidOperationException("Failed to create uplink plain transport");
        }

        _uplinkTransportId = uplinkTransport.Id;

        var apiHost = new Uri(_configService.ServerUrl).Host;
        var uplinkPort = uplinkTransport.Tuple?.LocalPort ?? 0;
        if (uplinkPort <= 0)
        {
            throw new InvalidOperationException("Plain transport did not return a valid RTP port");
        }

        var serverIp = ResolveServerIp(apiHost);
        _uplinkTarget = new IPEndPoint(serverIp, uplinkPort);
        _uplinkUdp = new UdpClient(0);

        // 2) Create Opus encoder and producer rtpParameters
        _ssrc = (uint)Random.Shared.NextInt64(1, uint.MaxValue);
        _seq = (ushort)Random.Shared.Next(0, ushort.MaxValue);
        _timestamp = (uint)Random.Shared.NextInt64(0, uint.MaxValue);

        _opusEncoder = OpusEncoder.Create(OpusSampleRate, UplinkOpusChannels, OpusApplication.OPUS_APPLICATION_VOIP);
        _opusEncoder.UseVBR = true;
        _opusEncoder.Bitrate = 96000;

        var rtpParameters = BuildOpusRtpParameters(_ssrc, _payloadType);

        var uplinkProducer = await PostJsonAsync<PlainProduceResponse>(
            _httpClient,
            "/api/webrtc/plain-produce",
            new
            {
                groupId = callId,
                transportId = _uplinkTransportId,
                rtpParameters,
                appData = new { groupId = callId, callId, userId = _authService.CurrentUser?.Id, client = "wpf" }
            },
            ct);

        _uplinkProducerId = uplinkProducer?.Id;
        _logger.LogInformation("RTP bridge uplink ready. callId={CallId} transportId={TransportId} producerId={ProducerId} target={Target}",
            callId, _uplinkTransportId, _uplinkProducerId ?? "<null>", _uplinkTarget);

        // 3) Start microphone capture using AudioService events
        await _audioService.InitializeAsync();
        _audioService.AudioDataAvailable += OnPcmFromMic;
        await _audioService.StartRecordingAsync();
    }

    private async Task StopUplinkOnlyAsync()
    {
        string? transportId;
        string? producerId;
        HttpClient? client;

        lock (_lock)
        {
            transportId = _uplinkTransportId;
            producerId = _uplinkProducerId;
            client = _httpClient;
        }

        if (client != null)
        {
            // Best-effort: prevent mediasoup port exhaustion by closing server-side resources.
            await TryDeleteServerResourceAsync(client, $"/api/webrtc/producer/{producerId}");
            await TryDeleteServerResourceAsync(client, $"/api/webrtc/transport/{transportId}");
        }

        try
        {
            _audioService.AudioDataAvailable -= OnPcmFromMic;
        }
        catch { }

        try
        {
            await _audioService.StopRecordingAsync();
        }
        catch { }

        try
        {
            if (_uplinkUdp != null)
            {
                _uplinkUdp.Close();
                _uplinkUdp.Dispose();
                _uplinkUdp = null;
            }
        }
        catch { }

        _uplinkTarget = null;
        _opusEncoder = null;

        lock (_lock)
        {
            _uplinkTransportId = null;
            _uplinkProducerId = null;
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        await _lifecycleSemaphore.WaitAsync(cancellationToken);
        try
        {
            await StopInternalAsync(cancellationToken);
        }
        finally
        {
            try { _lifecycleSemaphore.Release(); } catch { }
        }
    }

    private async Task StopInternalAsync(CancellationToken cancellationToken = default)
    {
        string? callId;
        CancellationTokenSource? cts;
        HttpClient? client;
        string? uplinkTransportId;
        string? uplinkProducerId;
        string? downlinkTransportId;
        string? downlinkConsumerId;

        lock (_lock)
        {
            if (!_isRunning)
            {
                return;
            }

            _isRunning = false;
            callId = _callId;
            _callId = null;
            cts = _cts;
            _cts = null;

            client = _httpClient;
            uplinkTransportId = _uplinkTransportId;
            uplinkProducerId = _uplinkProducerId;
            downlinkTransportId = _downlinkTransportId;
            downlinkConsumerId = _downlinkConsumerId;
        }

        if (client != null)
        {
            // Best-effort cleanup of server-side mediasoup resources.
            await TryDeleteServerResourceAsync(client, $"/api/webrtc/consumer/{downlinkConsumerId}");
            await TryDeleteServerResourceAsync(client, $"/api/webrtc/transport/{downlinkTransportId}");
            await TryDeleteServerResourceAsync(client, $"/api/webrtc/producer/{uplinkProducerId}");
            await TryDeleteServerResourceAsync(client, $"/api/webrtc/transport/{uplinkTransportId}");
        }

        try
        {
            cts?.Cancel();
        }
        catch { }

        try
        {
            _audioService.AudioDataAvailable -= OnPcmFromMic;
        }
        catch { }

        try
        {
            await _audioService.StopRecordingAsync();
        }
        catch { }

        try
        {
            if (_downlinkUdp != null)
            {
                _downlinkUdp.Close();
                _downlinkUdp.Dispose();
                _downlinkUdp = null;
            }
        }
        catch { }

        try
        {
            if (_uplinkUdp != null)
            {
                _uplinkUdp.Close();
                _uplinkUdp.Dispose();
                _uplinkUdp = null;
            }
        }
        catch { }

        _opusEncoder = null;
        _opusDecoder = null;
        _httpClient?.Dispose();
        _httpClient = null;

        _uplinkTransportId = null;
        _uplinkProducerId = null;
        _downlinkTransportId = null;
        _downlinkConsumerId = null;

        try
        {
            cts?.Dispose();
        }
        catch { }

        _logger.LogInformation("RTP bridge stopped for callId={CallId}", callId ?? "<null>");
    }

    private async Task EnsureDownlinkAsync(string callId, CancellationToken ct)
    {
        if (_httpClient == null)
        {
            throw new InvalidOperationException("RTP bridge HTTP client not initialized");
        }

        // If a downlink already exists, do not recreate it here.
        // The watchdog can restart the downlink when it becomes stale.
        if (_downlinkUdp != null)
        {
            return;
        }

        // Wait briefly for remote producers to appear.
        var deadline = DateTime.UtcNow.AddSeconds(5);
        string? remoteProducerId = null;

        while (!ct.IsCancellationRequested && DateTime.UtcNow < deadline && string.IsNullOrWhiteSpace(remoteProducerId))
        {
            try
            {
                var response = await GetJsonAsync<GroupProducersResponse>(_httpClient, $"/api/webrtc/groups/{callId}/producers", ct);
                var producers = response?.Producers;
                if (producers == null || producers.Count == 0)
                {
                    _logger.LogDebug("Producer discovery: no producers yet for callId={CallId}", callId);
                }
                else
                {
                    _logger.LogDebug("Producer discovery: {Count} producer(s) for callId={CallId}: {Producers}",
                        producers.Count,
                        callId,
                        string.Join(", ", producers.Select(p => $"{p.Kind}:{p.Id}")));

                    // IMPORTANT:
                    // Producers can linger briefly (or be recreated) across broadcast speak sessions.
                    // If we pick the first producer we can end up subscribing to a stale producerId
                    // and never receive RTP packets when a new speaker starts.
                    // Prefer the newest audio producer (last in the list).
                    var audioProducers = producers
                        .Where(p => string.Equals(p.Kind, "audio", StringComparison.OrdinalIgnoreCase))
                        .Where(p => !string.IsNullOrWhiteSpace(p.Id))
                        .Where(p => !string.Equals(p.Id, _uplinkProducerId, StringComparison.OrdinalIgnoreCase))
                        .Where(p => !IsOwnProducer(p))
                        .Where(p => !IsRawSipLegProducer(p))
                        .ToList();

                    remoteProducerId = audioProducers
                        .Where(IsSipRelayProducer)
                        .Select(p => p.Id)
                        .LastOrDefault()
                        ?? audioProducers.Select(p => p.Id).LastOrDefault();

                    if (!string.IsNullOrWhiteSpace(remoteProducerId))
                    {
                        _logger.LogInformation("Producer discovery: selected remote audio producerId={ProducerId} for callId={CallId}", remoteProducerId, callId);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Producer discovery failed; retrying");
            }

            if (string.IsNullOrWhiteSpace(remoteProducerId))
            {
                await Task.Delay(250, ct);
            }
        }

        if (string.IsNullOrWhiteSpace(remoteProducerId))
        {
            _logger.LogWarning("No remote audio producer discovered for callId={CallId} within timeout", callId);
            return;
        }

        // Bind local UDP socket for downlink.
        _downlinkUdp = new UdpClient(0);
        var localEp = (IPEndPoint)_downlinkUdp.Client.LocalEndPoint!;

        var serverHost = new Uri(_configService.ServerUrl).Host;
        var localIp = GetLocalLanAddress(serverHost);
        if (localIp == null)
        {
            throw new InvalidOperationException("Could not determine local LAN IP address for RTP downlink");
        }

        _logger.LogInformation("Broadcast downlink binding: serverHost={ServerHost} localIp={LocalIp} localPort={LocalPort}", serverHost, localIp, localEp.Port);

        var downlink = await PostJsonAsync<PlainConsumeResponse>(
            _httpClient,
            "/api/webrtc/plain-consume",
            new { groupId = callId, producerId = remoteProducerId, ip = localIp.ToString(), port = localEp.Port, rtcpPort = (int?)null },
            ct);

        try
        {
            lock (_lock)
            {
                _downlinkTransportId = downlink?.Transport?.Id;

                if (downlink?.Consumer.ValueKind == JsonValueKind.Object
                    && downlink.Consumer.TryGetProperty("id", out var idEl)
                    && idEl.ValueKind == JsonValueKind.String)
                {
                    _downlinkConsumerId = idEl.GetString();
                }
            }
        }
        catch { }

        if (downlink?.Transport?.Tuple?.LocalPort is int remotePort && remotePort > 0)
        {
            _logger.LogInformation("Downlink transport created on server. callId={CallId} serverRtpPort={Port}", callId, remotePort);

            // Kick UDP path open (helps with NAT/firewall state so server RTP can reach us).
            try
            {
                var host = new Uri(_configService.ServerUrl).Host;
                var serverIp = ResolveServerIp(host);
                await _downlinkUdp.SendAsync(new byte[] { 0x00 }, 1, new IPEndPoint(serverIp, remotePort));
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Downlink UDP kick send failed");
            }
        }

        _logger.LogInformation("Downlink consumer created. callId={CallId} remoteProducerId={ProducerId} local={LocalIp}:{LocalPort}",
            callId, remoteProducerId, localIp, localEp.Port);

        var ch = _downlinkOpusChannels;
        if (ch != 1 && ch != 2) ch = 2;
        _opusDecoder = OpusDecoder.Create(OpusSampleRate, ch);

        _downlinkLoop = Task.Run(() => DownlinkReceiveLoop(ct), ct);

        // Start (or keep) watchdog to recover from stale producer selection / stalled UDP receive.
        _downlinkWatchdog ??= Task.Run(() => DownlinkWatchdogLoop(callId, ct), ct);
    }

    private bool IsRawSipLegProducer(ProducerInfo producer)
    {
        return string.Equals(GetProducerSource(producer), "sip-leg", StringComparison.OrdinalIgnoreCase);
    }

    private bool IsSipRelayProducer(ProducerInfo producer)
    {
        return string.Equals(GetProducerSource(producer), "sip-relay", StringComparison.OrdinalIgnoreCase);
    }

    private static string? GetProducerSource(ProducerInfo producer)
    {
        try
        {
            if (producer.AppData.ValueKind != JsonValueKind.Object) return null;
            if (producer.AppData.TryGetProperty("source", out var sourceEl) && sourceEl.ValueKind == JsonValueKind.String)
            {
                return sourceEl.GetString();
            }
        }
        catch { }
        return null;
    }

    private bool IsOwnProducer(ProducerInfo producer)
    {
        try
        {
            var myUserId = _authService.CurrentUser?.Id;
            if (string.IsNullOrWhiteSpace(myUserId))
            {
                return false;
            }

            if (producer.AppData.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            string? userId = null;

            if (producer.AppData.TryGetProperty("userId", out var userIdEl) && userIdEl.ValueKind == JsonValueKind.String)
            {
                userId = userIdEl.GetString();
            }

            if (!string.IsNullOrWhiteSpace(userId) && string.Equals(userId, myUserId, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        catch { }

        return false;
    }

    private async Task DownlinkWatchdogLoop(string callId, CancellationToken ct)
    {
        // Wait a brief moment for the first packets; then monitor for stalls.
        _lastDownlinkPacketUtc = DateTime.UtcNow;

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            if (ct.IsCancellationRequested)
            {
                break;
            }

            if (!_enableDownlink)
            {
                continue;
            }

            // If monitoring starts before anyone speaks, there may be no producers yet.
            // Keep trying to create the downlink until a producer appears.
            if (_downlinkUdp == null)
            {
                try
                {
                    await EnsureDownlinkAsync(callId, ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch
                {
                    // Swallow and retry on next tick.
                }

                continue;
            }

            // Only auto-restart on stalls in receive-only mode.
            if (_enableUplink)
            {
                continue;
            }

            var last = _lastDownlinkPacketUtc;
            if (last == DateTime.MinValue)
            {
                continue;
            }

            var age = DateTime.UtcNow - last;
            if (age < TimeSpan.FromSeconds(6))
            {
                continue;
            }

            if (Interlocked.Exchange(ref _downlinkRestartInProgress, 1) == 1)
            {
                continue;
            }

            try
            {
                _logger.LogWarning("Downlink watchdog: no RTP received for {AgeSeconds:n1}s; restarting downlink. callId={CallId}", age.TotalSeconds, callId);
                await RestartDownlinkAsync(callId, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Downlink watchdog: restart failed. callId={CallId}", callId);
            }
            finally
            {
                Interlocked.Exchange(ref _downlinkRestartInProgress, 0);
            }
        }
    }

    private async Task RestartDownlinkAsync(string callId, CancellationToken ct)
    {
        HttpClient? client;
        string? consumerId;
        string? transportId;

        lock (_lock)
        {
            client = _httpClient;
            consumerId = _downlinkConsumerId;
            transportId = _downlinkTransportId;
        }

        if (client == null)
        {
            return;
        }

        // Best-effort cleanup: close prior downlink resources server-side before recreating.
        await TryDeleteServerResourceAsync(client, $"/api/webrtc/consumer/{consumerId}");
        await TryDeleteServerResourceAsync(client, $"/api/webrtc/transport/{transportId}");

        try
        {
            if (_downlinkUdp != null)
            {
                _downlinkUdp.Close();
                _downlinkUdp.Dispose();
                _downlinkUdp = null;
            }
        }
        catch { }

        lock (_lock)
        {
            _downlinkTransportId = null;
            _downlinkConsumerId = null;
        }

        _opusDecoder = null;
        _downlinkLoop = null;
        _lastDownlinkPacketUtc = DateTime.UtcNow;

        await EnsureDownlinkAsync(callId, ct);
    }

    private async Task TryDeleteServerResourceAsync(HttpClient client, string path)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(path) || path.EndsWith("/", StringComparison.Ordinal))
            {
                return;
            }

            // Skip obvious null/empty ids.
            if (path.EndsWith("/<null>", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith("/null", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var resp = await client.DeleteAsync(path);
            try { resp.Dispose(); } catch { }
        }
        catch { }
    }

    private async Task DownlinkReceiveLoop(CancellationToken ct)
    {
        if (_downlinkUdp == null || _opusDecoder == null)
        {
            return;
        }

        var decoder = _opusDecoder;

        var seenPacket = false;
        var lastDecodeLog = DateTime.UtcNow;
        var lastPlaybackErrorLog = DateTime.UtcNow.AddSeconds(-10);

        // Allocate buffer large enough for 20ms at the negotiated downlink channel count.
        // We over-allocate 2x to tolerate occasional larger decoded frames (PLC).
        var downlinkChannels = _downlinkOpusChannels;
        if (downlinkChannels != 1 && downlinkChannels != 2) downlinkChannels = 2;
        var decoded = new short[SamplesPerChannelPerFrame * downlinkChannels * 2];

        while (!ct.IsCancellationRequested)
        {
            UdpReceiveResult result;
            try
            {
                result = await _downlinkUdp.ReceiveAsync(ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Downlink UDP receive error");
                continue;
            }

            var packet = result.Buffer;
            if (packet.Length < 12)
            {
                continue;
            }

            if (!seenPacket)
            {
                seenPacket = true;
                _logger.LogInformation("Downlink RTP: first packet received. bytes={Bytes}", packet.Length);
            }

            _lastDownlinkPacketUtc = DateTime.UtcNow;

            // Basic RTP header parse (no CSRC/ext).
            var version = (byte)(packet[0] >> 6);
            if (version != RtpVersion)
            {
                continue;
            }

            // Drop non-Opus payloads (including RTCP when rtcpMux=true).
            // RTCP packets also use version 2 and can otherwise slip through.
            var payloadType = (byte)(packet[1] & 0x7F);
            if (payloadType != _payloadType)
            {
                continue;
            }

            int cc = packet[0] & 0x0F;
            bool x = (packet[0] & 0x10) != 0;
            int headerLen = 12 + (cc * 4);
            if (x)
            {
                // Skip extensions (not expected).
                if (packet.Length < headerLen + 4) continue;
                int extLenWords = (packet[headerLen + 2] << 8) | packet[headerLen + 3];
                headerLen += 4 + (extLenWords * 4);
            }

            if (packet.Length <= headerLen)
            {
                continue;
            }

            int decodedSamples;
            try
            {
                int payloadLen = packet.Length - headerLen;
                if (payloadLen <= 0) continue;

                var payloadBytes = new byte[payloadLen];
                Buffer.BlockCopy(packet, headerLen, payloadBytes, 0, payloadLen);

                decodedSamples = decoder.Decode(payloadBytes, 0, payloadBytes.Length, decoded, 0, SamplesPerChannelPerFrame, false);
            }
            catch
            {
                continue;
            }

            if (decodedSamples <= 0)
            {
                continue;
            }

            if ((DateTime.UtcNow - lastDecodeLog) > TimeSpan.FromSeconds(2))
            {
                lastDecodeLog = DateTime.UtcNow;
                _logger.LogInformation("Downlink RTP: decodedSamplesPerChannel={Samples}", decodedSamples);
            }

            // Normalize to a fixed 20ms frame (960 samples/channel at 48kHz).
            // Variable-size decoded frames (e.g., due to packet loss/PLC) can cause WAV writers
            // to compress/expand time, sounding "warbly" or too fast/slow.
            var targetSamplesPerChannel = SamplesPerChannelPerFrame;
            if (decodedSamples != targetSamplesPerChannel)
            {
                var fixedShorts = new short[targetSamplesPerChannel * downlinkChannels];
                var copySamplesPerChannel = Math.Min(decodedSamples, targetSamplesPerChannel);
                var copyShortCount = copySamplesPerChannel * downlinkChannels;
                Array.Copy(decoded, 0, fixedShorts, 0, copyShortCount);

                await PlayDownlinkPcmAsync(fixedShorts, downlinkChannels);
                continue;
            }

            try
            {
                // decoded contains interleaved samples for downlinkChannels.
                var exactShorts = new short[targetSamplesPerChannel * downlinkChannels];
                Array.Copy(decoded, 0, exactShorts, 0, exactShorts.Length);
                await PlayDownlinkPcmAsync(exactShorts, downlinkChannels);
            }
            catch (Exception ex)
            {
                if ((DateTime.UtcNow - lastPlaybackErrorLog) > TimeSpan.FromSeconds(5))
                {
                    lastPlaybackErrorLog = DateTime.UtcNow;
                    _logger.LogWarning(ex, "Downlink RTP: playback failed (audio output). callId={CallId}", _callId);
                }
            }
        }
    }

    private void OnPcmFromMic(object? sender, byte[] pcm)
    {
        try
        {
            if (!_isRunning || _uplinkUdp == null || _uplinkTarget == null || _opusEncoder == null)
            {
                return;
            }

            // Buffer until we have at least one 20ms frame.
            var toCopy = Math.Min(pcm.Length, _pcmBuffer.Length - _pcmBuffered);
            if (toCopy <= 0)
            {
                return;
            }

            Buffer.BlockCopy(pcm, 0, _pcmBuffer, _pcmBuffered, toCopy);
            _pcmBuffered += toCopy;

            while (_pcmBuffered >= UplinkPcmBytesPerFrame)
            {
                Span<byte> frame = _pcmBuffer.AsSpan(0, UplinkPcmBytesPerFrame);

                // Shift remaining.
                _pcmBuffered -= UplinkPcmBytesPerFrame;
                if (_pcmBuffered > 0)
                {
                    Buffer.BlockCopy(_pcmBuffer, UplinkPcmBytesPerFrame, _pcmBuffer, 0, _pcmBuffered);
                }

                // Convert to short[]
                var pcmShorts = new short[SamplesPerChannelPerFrame * UplinkOpusChannels];
                Buffer.BlockCopy(frame.ToArray(), 0, pcmShorts, 0, UplinkPcmBytesPerFrame);

                var opus = new byte[4000];
                int opusLen = _opusEncoder.Encode(pcmShorts, 0, SamplesPerChannelPerFrame, opus, 0, opus.Length);
                if (opusLen <= 0)
                {
                    continue;
                }

                var rtp = BuildRtpPacket(opus.AsSpan(0, opusLen));
                _uplinkUdp.Send(rtp, rtp.Length, _uplinkTarget);

                // Advance timestamp by samples per channel.
                _timestamp += (uint)SamplesPerChannelPerFrame;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Mic encode/send failed");
        }
    }

    private byte[] BuildRtpPacket(ReadOnlySpan<byte> payload)
    {
        var packet = new byte[12 + payload.Length];

        packet[0] = (byte)((RtpVersion << 6) | 0x00); // V=2, P=0, X=0, CC=0
        packet[1] = _payloadType; // M=0, PT=dynamic

        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(2, 2), _seq++);
        BinaryPrimitives.WriteUInt32BigEndian(packet.AsSpan(4, 4), _timestamp);
        BinaryPrimitives.WriteUInt32BigEndian(packet.AsSpan(8, 4), _ssrc);

        payload.CopyTo(packet.AsSpan(12));
        return packet;
    }

    private static object BuildOpusRtpParameters(uint ssrc, byte payloadType)
    {
        return new
        {
            codecs = new object[]
            {
                new
                {
                    mimeType = "audio/opus",
                    payloadType,
                    clockRate = 48000,
                    channels = UplinkOpusChannels,
                    parameters = new { useinbandfec = 1, minptime = 10 }
                }
            },
            encodings = new object[]
            {
                new { ssrc }
            },
            headerExtensions = Array.Empty<object>(),
            rtcp = new { cname = "wpf", reducedSize = true }
        };
    }

    private static async Task<byte> DiscoverOpusPayloadTypeAsync(HttpClient client, string callId, CancellationToken ct)
    {
        try
        {
            var caps = await GetJsonAsync<RtpCapabilities>(client, $"/api/webrtc/groups/{callId}/rtp-capabilities", ct);
            var pt = caps?.Codecs?.FirstOrDefault(c => string.Equals(c.MimeType, "audio/opus", StringComparison.OrdinalIgnoreCase))?.PreferredPayloadType;
            if (pt.HasValue)
            {
                return (byte)pt.Value;
            }
        }
        catch { }

        try
        {
            var caps = await GetJsonAsync<RtpCapabilities>(client, "/api/webrtc/rtp-capabilities", ct);
            var pt = caps?.Codecs?.FirstOrDefault(c => string.Equals(c.MimeType, "audio/opus", StringComparison.OrdinalIgnoreCase))?.PreferredPayloadType;
            if (pt.HasValue)
            {
                return (byte)pt.Value;
            }
        }
        catch { }

        return DefaultPayloadTypeOpus;
    }

    private sealed class RtpCapabilities
    {
        public List<RtpCodecCapability> Codecs { get; set; } = new();
    }

    private sealed class RtpCodecCapability
    {
        public string MimeType { get; set; } = string.Empty;
        public int? PreferredPayloadType { get; set; }
        public int? Channels { get; set; }
    }

    private static async Task<int> DiscoverOpusChannelCountAsync(HttpClient client, string callId, CancellationToken ct)
    {
        // Default to stereo if unknown.
        // Many voice deployments use mono Opus; decoding with the wrong channel count causes distortion.
        try
        {
            var caps = await GetJsonAsync<RtpCapabilities>(client, $"/api/webrtc/groups/{callId}/rtp-capabilities", ct);
            var ch = caps?.Codecs?.FirstOrDefault(c => string.Equals(c.MimeType, "audio/opus", StringComparison.OrdinalIgnoreCase))?.Channels;
            if (ch.HasValue && (ch.Value == 1 || ch.Value == 2))
            {
                return ch.Value;
            }
        }
        catch { }

        try
        {
            var caps = await GetJsonAsync<RtpCapabilities>(client, "/api/webrtc/rtp-capabilities", ct);
            var ch = caps?.Codecs?.FirstOrDefault(c => string.Equals(c.MimeType, "audio/opus", StringComparison.OrdinalIgnoreCase))?.Channels;
            if (ch.HasValue && (ch.Value == 1 || ch.Value == 2))
            {
                return ch.Value;
            }
        }
        catch { }

        return 2;
    }

    private async Task PlayDownlinkPcmAsync(short[] pcmInterleaved, int channels)
    {
        // AudioService is configured for 48kHz, 16-bit, stereo.
        // If downlink is mono, up-mix by duplicating samples to both channels.
        if (channels == 2)
        {
            var pcmBytes = new byte[pcmInterleaved.Length * sizeof(short)];
            Buffer.BlockCopy(pcmInterleaved, 0, pcmBytes, 0, pcmBytes.Length);
            await _audioService.PlayAudioAsync(pcmBytes);
            return;
        }

        if (channels == 1)
        {
            var samplesPerChannel = pcmInterleaved.Length;
            var stereo = new short[samplesPerChannel * 2];
            for (int i = 0; i < samplesPerChannel; i++)
            {
                var s = pcmInterleaved[i];
                stereo[(i * 2) + 0] = s;
                stereo[(i * 2) + 1] = s;
            }

            var pcmBytes = new byte[stereo.Length * sizeof(short)];
            Buffer.BlockCopy(stereo, 0, pcmBytes, 0, pcmBytes.Length);
            await _audioService.PlayAudioAsync(pcmBytes);
            return;
        }
    }

    private static HttpClient CreateHttpClient(string baseUrl, string bearerToken)
    {
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true
        };

        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri(baseUrl.TrimEnd('/')),
            Timeout = TimeSpan.FromSeconds(10)
        };

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        return client;
    }

    private static async Task<T?> PostJsonAsync<T>(HttpClient client, string path, object body, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(body);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        using var response = await client.PostAsync(path, content, ct);

        if (!response.IsSuccessStatusCode)
        {
            var bodyText = await response.Content.ReadAsStringAsync(ct);

            // Some deployments mount API routes without the /api prefix.
            if (response.StatusCode == HttpStatusCode.NotFound && path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
            {
                var retryPath = path[4..];
                using var retryContent = new StringContent(json, Encoding.UTF8, "application/json");
                using var retryResponse = await client.PostAsync(retryPath, retryContent, ct);
                if (!retryResponse.IsSuccessStatusCode)
                {
                    var retryBodyText = await retryResponse.Content.ReadAsStringAsync(ct);
                    throw new HttpRequestException(
                        $"POST {path} failed with {(int)response.StatusCode} {response.ReasonPhrase}: {bodyText}. " +
                        $"Retry POST {retryPath} failed with {(int)retryResponse.StatusCode} {retryResponse.ReasonPhrase}: {retryBodyText}.");
                }

                var retryJson = await retryResponse.Content.ReadAsStringAsync(ct);
                return JsonSerializer.Deserialize<T>(retryJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }

            throw new HttpRequestException($"POST {path} failed with {(int)response.StatusCode} {response.ReasonPhrase}: {bodyText}");
        }

        var responseJson = await response.Content.ReadAsStringAsync(ct);
        return JsonSerializer.Deserialize<T>(responseJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    }

    private static async Task<T?> GetJsonAsync<T>(HttpClient client, string path, CancellationToken ct)
    {
        using var response = await client.GetAsync(path, ct);

        if (!response.IsSuccessStatusCode)
        {
            var bodyText = await response.Content.ReadAsStringAsync(ct);

            if (response.StatusCode == HttpStatusCode.NotFound && path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
            {
                var retryPath = path[4..];
                using var retryResponse = await client.GetAsync(retryPath, ct);
                if (!retryResponse.IsSuccessStatusCode)
                {
                    var retryBodyText = await retryResponse.Content.ReadAsStringAsync(ct);
                    throw new HttpRequestException(
                        $"GET {path} failed with {(int)response.StatusCode} {response.ReasonPhrase}: {bodyText}. " +
                        $"Retry GET {retryPath} failed with {(int)retryResponse.StatusCode} {retryResponse.ReasonPhrase}: {retryBodyText}.");
                }

                var retryJson = await retryResponse.Content.ReadAsStringAsync(ct);
                return JsonSerializer.Deserialize<T>(retryJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }

            throw new HttpRequestException($"GET {path} failed with {(int)response.StatusCode} {response.ReasonPhrase}: {bodyText}");
        }

        var responseJson = await response.Content.ReadAsStringAsync(ct);
        return JsonSerializer.Deserialize<T>(responseJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    }

    private static IPAddress ResolveServerIp(string host)
    {
        if (IPAddress.TryParse(host, out var ip))
        {
            return ip;
        }

        var addresses = Dns.GetHostAddresses(host);
        var firstV4 = addresses.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork);
        return firstV4 ?? addresses.First();
    }

    private static IPAddress? GetLocalLanAddress(string serverHost)
    {
        try
        {
            // Choose the interface the OS would use to reach the server.
            // This avoids picking the wrong adapter (VPN/Hyper-V/etc.).
            using var udp = new UdpClient(AddressFamily.InterNetwork);
            var serverIp = ResolveServerIp(serverHost);

            // If the API host is loopback (localhost/127.0.0.1), the UDP "route" will often resolve to 127.0.0.1.
            // For RTP the server must send to an address it can reach, so prefer a non-loopback IPv4.
            if (IPAddress.IsLoopback(serverIp))
            {
                return GetFirstNonLoopbackIPv4();
            }

            udp.Connect(serverIp, 9); // UDP "connect"; no packets sent.
            if (udp.Client.LocalEndPoint is IPEndPoint local)
            {
                return local.Address;
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static IPAddress? GetFirstNonLoopbackIPv4()
    {
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                var props = nic.GetIPProperties();
                foreach (var ua in props.UnicastAddresses)
                {
                    if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    if (IPAddress.IsLoopback(ua.Address)) continue;
                    return ua.Address;
                }
            }
        }
        catch { }

        return null;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopAsync().Wait(TimeSpan.FromSeconds(2));
    }

    private sealed class PlainTransportResponse
    {
        public string Id { get; set; } = string.Empty;
        public PlainTuple? Tuple { get; set; }
        public PlainTuple? RtcpTuple { get; set; }
        public bool RtcpMux { get; set; }
        public bool Comedia { get; set; }
    }

    private sealed class PlainTuple
    {
        public string LocalIp { get; set; } = string.Empty;
        public int LocalPort { get; set; }
    }

    private sealed class PlainProduceResponse
    {
        public string Id { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
    }

    private sealed class ProducerInfo
    {
        public string Id { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public JsonElement AppData { get; set; }
    }

    private sealed class GroupProducersResponse
    {
        public bool Success { get; set; }
        public List<ProducerInfo> Producers { get; set; } = new();
    }

    private sealed class PlainConsumeResponse
    {
        public PlainTransportResponse? Transport { get; set; }
        public JsonElement Consumer { get; set; }
    }
}
