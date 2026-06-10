using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class CallService : ICallService
{
    private readonly ILogger<CallService> _logger;
    private readonly ISocketService _socketService;
    private readonly IAudioService _audioService;
    private readonly IAudioStreamingService _audioStreamingService;
    private readonly IMediaSoupService _mediaSoupService;
    private readonly IBroadcastRtpBridgeService _broadcastRtpBridgeService;
    private readonly IWebMediaEngineService _webMediaEngineService;
    private readonly ICallRecordingService _callRecordingService;
    private readonly IAuthService _authService;
    private readonly object _callLock = new();
    private string? _streamingCallId;
    private bool? _streamingEnableVideo;
    private Call? _currentCall;

    private readonly object _speakerLock = new();
    private readonly HashSet<string> _speakers = new(StringComparer.OrdinalIgnoreCase);

    // One lock for all broadcast state (media, recording, vox): the three groups
    // transition together, and a single reentrant lock keeps those transitions
    // atomic without lock-ordering concerns.
    private readonly object _broadcastLock = new();
    private string? _broadcastMediaGroupId;
    private bool _broadcastMonitoring;
    private bool _broadcastTransmitting;

    private Call? _broadcastRecordingCall;
    private readonly HashSet<string> _broadcastRecordingSpeakers = new(StringComparer.OrdinalIgnoreCase);

    private DateTime _broadcastLastAudioUtc = DateTime.MinValue;
    private bool _broadcastChunkRecordingEnabled;

    private string? _broadcastVoxGroupId;
    private DateTime _broadcastLastNonSilentUtc = DateTime.MinValue;
    private bool _broadcastVoxActive;
    private System.Threading.Timer? _broadcastVoxTimer;

    public Call? CurrentCall => _currentCall;
    public bool IsInCall => _currentCall != null && _currentCall.State == CallState.Connected;

    public event EventHandler<Call>? CallStarted;
    public event EventHandler<Call>? CallStateChanged;
    public event EventHandler<string>? CallEnded;
    public event EventHandler<(string GroupId, bool IsActive)>? BroadcastVoxChanged;

    public CallService(
        ILogger<CallService> logger,
        ISocketService socketService,
        IAudioService audioService,
        IAudioStreamingService audioStreamingService,
        IMediaSoupService mediaSoupService,
        IBroadcastRtpBridgeService broadcastRtpBridgeService,
        IWebMediaEngineService webMediaEngineService,
        ICallRecordingService callRecordingService,
        IAuthService authService)
    {
        _logger = logger;
        _socketService = socketService;
        _audioService = audioService;
        _audioStreamingService = audioStreamingService;
        _mediaSoupService = mediaSoupService;
        _broadcastRtpBridgeService = broadcastRtpBridgeService;
        _webMediaEngineService = webMediaEngineService;
        _callRecordingService = callRecordingService;
        _authService = authService;

        // Subscribe to socket events
        _socketService.IncomingCall += OnIncomingCall;
        _socketService.CallStateChanged += OnCallStateChanged;
        _socketService.CallEnded += OnCallEnded;
        _socketService.WebRTCSetupRequired += OnWebRTCSetupRequired;
        _socketService.AudioLevelReceived += OnAudioLevelReceived;

        _audioService.PlaybackAudioAvailable += OnBroadcastPlaybackPcm;
        
        // Subscribe to MediaSoup events
        _mediaSoupService.ConnectionStateChanged += OnMediaSoupConnectionChanged;
        _mediaSoupService.Error += OnMediaSoupError;
    }

    private static bool IsNonSilentPcm(byte[] pcm)
    {
        if (pcm == null || pcm.Length < 2) return false;

        var peak = 0;
        for (int i = 0; i + 1 < pcm.Length; i += 2)
        {
            var sample = BitConverter.ToInt16(pcm, i);
            var abs = sample < 0 ? -sample : sample;
            if (abs > peak) peak = abs;
            if (peak >= 700) return true;
        }

        return false;
    }

    private void EnsureBroadcastVoxTimer_NoThrow()
    {
        try
        {
            lock (_broadcastLock)
            {
                if (_broadcastVoxTimer != null) return;
                _broadcastVoxTimer = new System.Threading.Timer(_ =>
                {
                    try
                    {
                        string? groupId;
                        bool active;
                        DateTime lastNonSilent;

                        lock (_broadcastLock)
                        {
                            groupId = _broadcastVoxGroupId;
                            active = _broadcastVoxActive;
                            lastNonSilent = _broadcastLastNonSilentUtc;
                        }

                        if (!active || string.IsNullOrWhiteSpace(groupId) || lastNonSilent == DateTime.MinValue)
                        {
                            return;
                        }

                        // Debounce silence: keep "active" for a short period after last audio.
                        if ((DateTime.UtcNow - lastNonSilent) > TimeSpan.FromMilliseconds(1200))
                        {
                            lock (_broadcastLock)
                            {
                                if (!_broadcastVoxActive) return;
                                _broadcastVoxActive = false;
                            }

                            BroadcastVoxChanged?.Invoke(this, (groupId, false));
                        }
                    }
                    catch { }
                }, null, TimeSpan.FromMilliseconds(250), TimeSpan.FromMilliseconds(250));
            }
        }
        catch { }
    }

    private void ClearBroadcastVox_NoThrow(string groupId)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(groupId)) return;

            bool shouldRaise;
            lock (_broadcastLock)
            {
                shouldRaise = _broadcastVoxActive
                             && string.Equals(_broadcastVoxGroupId, groupId, StringComparison.OrdinalIgnoreCase);
                if (shouldRaise)
                {
                    _broadcastVoxActive = false;
                    _broadcastLastNonSilentUtc = DateTime.MinValue;
                }
            }

            if (shouldRaise)
            {
                BroadcastVoxChanged?.Invoke(this, (groupId, false));
            }
        }
        catch { }
    }

    private void OnBroadcastPlaybackPcm(object? sender, byte[] pcm)
    {
        try
        {
            // IMPORTANT:
            // Broadcast monitoring playback is delivered via the same playback pipeline as 1:1 calls.
            // If a direct/conference call is active, we must not treat playback audio as broadcast audio.
            // Otherwise a broadcast recording can accidentally capture 1:1 call audio.
            try
            {
                Call? activeCall;
                lock (_callLock)
                {
                    activeCall = _currentCall;
                }

                if (activeCall != null && activeCall.Type != CallType.Broadcast && activeCall.State != CallState.Ended)
                {
                    // If a broadcast recording is currently active, stop it immediately.
                    Call? activeBroadcastRecording;
                    lock (_broadcastLock)
                    {
                        activeBroadcastRecording = _broadcastRecordingCall;
                    }

                    if (_callRecordingService.IsRecording && activeBroadcastRecording != null)
                    {
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                _logger.LogInformation(
                                    "Stopping broadcast recording because a direct call is active. broadcastCallId={BroadcastCallId} directCallId={DirectCallId}",
                                    activeBroadcastRecording.Id,
                                    activeCall.Id);
                                var sid = activeBroadcastRecording.GroupId;
                                if (!string.IsNullOrWhiteSpace(sid))
                                {
                                    await _callRecordingService.StopAndUploadAsync("switch-to-direct", sid);
                                }
                                else
                                {
                                    await _callRecordingService.StopAndUploadAsync("switch-to-direct");
                                }
                            }
                            catch { }

                            try
                            {
                                lock (_broadcastLock)
                                {
                                    _broadcastRecordingCall = null;
                                    _broadcastRecordingSpeakers.Clear();
                                }
                            }
                            catch { }
                        });
                    }

                    return;
                }
            }
            catch { }

            string? groupId;
            bool monitoring;
            bool transmitting;
            bool enabled;

            lock (_broadcastLock)
            {
                groupId = _broadcastMediaGroupId;
                monitoring = _broadcastMonitoring;
                transmitting = _broadcastTransmitting;
                enabled = _broadcastChunkRecordingEnabled;
            }

            if (!enabled || !monitoring || transmitting || string.IsNullOrWhiteSpace(groupId))
            {
                return;
            }

            var isRecordingThisGroup = false;
            try
            {
                isRecordingThisGroup = _callRecordingService.IsRecordingSession(groupId);
            }
            catch { }

            var now = DateTime.UtcNow;
            if (IsNonSilentPcm(pcm))
            {
                EnsureBroadcastVoxTimer_NoThrow();

                bool shouldRaise = false;
                lock (_broadcastLock)
                {
                    _broadcastVoxGroupId = groupId;
                    _broadcastLastNonSilentUtc = now;
                    if (!_broadcastVoxActive)
                    {
                        _broadcastVoxActive = true;
                        shouldRaise = true;
                    }
                }

                if (shouldRaise)
                {
                    BroadcastVoxChanged?.Invoke(this, (groupId, true));
                }

                lock (_broadcastLock)
                {
                    _broadcastLastAudioUtc = now;
                }

                // Update existing recording with latest speakers
                if (isRecordingThisGroup)
                {
                    lock (_broadcastLock)
                    {
                        if (_broadcastRecordingCall != null)
                        {
                            // Update participants: current user + all speakers
                            var currentUserId = _authService.CurrentUser?.Id;
                            if (!string.IsNullOrWhiteSpace(currentUserId))
                            {
                                var participants = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { currentUserId };
                                foreach (var speaker in _broadcastRecordingSpeakers)
                                {
                                    participants.Add(speaker);
                                }
                                _broadcastRecordingCall.Participants = participants.ToList();
                                _broadcastRecordingCall.Speakers = _broadcastRecordingSpeakers.ToList();
                            }
                        }
                    }

                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await _callRecordingService.AppendPcmAsync(groupId, pcm);
                        }
                        catch { }
                    });
                }
                else
                {
                    // Never auto-start a broadcast recording while a non-broadcast call is active.
                    // Otherwise a background broadcast monitor can incorrectly create a broadcast recording
                    // during a 1:1 call (misclassification).
                    try
                    {
                        Call? activeCall;
                        lock (_callLock)
                        {
                            activeCall = _currentCall;
                        }

                        if (activeCall != null && activeCall.Type != CallType.Broadcast && activeCall.State != CallState.Ended)
                        {
                            return;
                        }
                    }
                    catch { }

                    // Start new recording when audio is detected (if not already started on monitor)
                    var currentUserId = _authService.CurrentUser?.Id;
                    if (string.IsNullOrWhiteSpace(currentUserId))
                    {
                        return;
                    }
                    
                    var call = new Call
                    {
                        Id = $"broadcast-{groupId}-{currentUserId}-{now:yyyyMMdd_HHmmss_fff}",
                        Type = CallType.Broadcast,
                        State = CallState.Connected,
                        GroupId = groupId,
                        GroupName = groupId,
                        LineName = groupId,
                        IsMonitoring = true,
                        StartTime = now,
                        // Participants: current user (the one monitoring) + speakers (will be added as they speak)
                        Participants = new List<string> { currentUserId },
                    };

                    lock (_broadcastLock)
                    {
                        _broadcastRecordingCall = call;
                        _broadcastRecordingSpeakers.Clear();
                    }

                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            _logger.LogInformation("Starting broadcast recording on audio detection. callId={CallId} groupId={GroupId} userId={UserId}", 
                                call.Id, call.GroupId, currentUserId);
                            await _callRecordingService.StartAsync(call, groupId);
                            _logger.LogInformation("Broadcast recording started successfully. callId={CallId}", call.Id);

                            try
                            {
                                await _callRecordingService.AppendPcmAsync(groupId, pcm);
                            }
                            catch { }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed starting broadcast chunk recording. callId={CallId} groupId={GroupId}", call.Id, call.GroupId);
                        }
                    });
                }

                return;
            }

            if (isRecordingThisGroup)
            {
                DateTime lastAudio;
                lock (_broadcastLock)
                {
                    lastAudio = _broadcastLastAudioUtc;
                }

                var silenceSeconds = 10;
                try
                {
                    silenceSeconds = _callRecordingService.VoiceVoxSilenceSeconds;
                }
                catch { }
                if (silenceSeconds < 1) silenceSeconds = 1;
                if (silenceSeconds > 120) silenceSeconds = 120;

                if (lastAudio != DateTime.MinValue && (now - lastAudio) > TimeSpan.FromSeconds(silenceSeconds))
                {
                    lock (_broadcastLock)
                    {
                        _broadcastLastAudioUtc = DateTime.MinValue;
                    }

                    lock (_broadcastLock)
                    {
                        if (_broadcastRecordingCall != null)
                        {
                            // Update participants: current user + all speakers
                            var currentUserId = _authService.CurrentUser?.Id;
                            if (!string.IsNullOrWhiteSpace(currentUserId))
                            {
                                var participants = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { currentUserId };
                                foreach (var speaker in _broadcastRecordingSpeakers)
                                {
                                    participants.Add(speaker);
                                }
                                _broadcastRecordingCall.Participants = participants.ToList();
                                _broadcastRecordingCall.Speakers = _broadcastRecordingSpeakers.ToList();
                            }
                        }
                    }

                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            _logger.LogInformation("Stopping broadcast recording due to silence timeout. groupId={GroupId} isRecording={IsRecording}", 
                                groupId, isRecordingThisGroup);
                            await _callRecordingService.StopAndUploadAsync("silence", groupId);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed stopping broadcast chunk recording due to silence. groupId={GroupId}", groupId);
                        }
                    });
                }
            }
        }
        catch { }
    }

    public async Task SetBroadcastMonitoringMediaAsync(string groupId, bool monitoring)
    {
        if (string.IsNullOrWhiteSpace(groupId)) return;

        bool restartReceiveOnly = false;
        bool stop = false;
        bool alreadyActive = false;

        lock (_broadcastLock)
        {
            // If we are already monitoring this same group (and not transmitting),
            // don't restart the RTP bridge. Duplicate broadcast-monitor updates are common.
            alreadyActive = monitoring
                            && _broadcastMonitoring
                            && !_broadcastTransmitting
                            && string.Equals(_broadcastMediaGroupId, groupId, StringComparison.OrdinalIgnoreCase);

            _broadcastMediaGroupId = groupId;
            _broadcastMonitoring = monitoring;

            _broadcastChunkRecordingEnabled = monitoring;
            if (!monitoring)
            {
                _broadcastLastAudioUtc = DateTime.MinValue;
            }

            if (!_broadcastTransmitting)
            {
                if (_broadcastMonitoring)
                {
                    // Only restart if needed.
                    restartReceiveOnly = !alreadyActive || !_broadcastRtpBridgeService.IsRunning(groupId);
                }
                else
                {
                    stop = true;
                }
            }
        }

        if (!monitoring)
        {
            ClearBroadcastVox_NoThrow(groupId);

            lock (_broadcastLock)
            {
                _broadcastRecordingCall = null;
                _broadcastRecordingSpeakers.Clear();
            }
        }

        try
        {
            if (stop)
            {
                await _broadcastRtpBridgeService.StopAsync(groupId);

                // Update participants before stopping: current user + all speakers
                Call? callToUpload = null;
                lock (_broadcastLock)
                {
                    if (_broadcastRecordingCall != null)
                    {
                        var currentUserId = _authService.CurrentUser?.Id;
                        if (!string.IsNullOrWhiteSpace(currentUserId))
                        {
                            var participants = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { currentUserId };
                            foreach (var speaker in _broadcastRecordingSpeakers)
                            {
                                participants.Add(speaker);
                            }
                            _broadcastRecordingCall.Participants = participants.ToList();
                            _broadcastRecordingCall.Speakers = _broadcastRecordingSpeakers.ToList();
                            callToUpload = _broadcastRecordingCall;
                        }
                    }
                    _broadcastRecordingCall = null;
                    _broadcastRecordingSpeakers.Clear();
                }

                try
                {
                    _logger.LogInformation("Stopping broadcast recording due to monitor-off. groupId={GroupId} isRecording={IsRecording}", 
                        groupId, _callRecordingService.IsRecordingSession(groupId));
                    await _callRecordingService.StopAndUploadAsync("monitor-off", groupId);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to stop and upload broadcast recording on monitor-off. groupId={GroupId}", groupId);
                }
                return;
            }

            if (restartReceiveOnly)
            {
                // Always restart to ensure the bridge is scoped to the latest groupId.
                await _broadcastRtpBridgeService.StopAsync(groupId);
                await _broadcastRtpBridgeService.StartReceiveOnlyAsync(groupId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set broadcast monitoring media (groupId={GroupId}, monitoring={Monitoring})", groupId, monitoring);
        }
    }

    public async Task SetBroadcastTransmittingMediaAsync(string groupId, bool transmitting)
    {
        if (string.IsNullOrWhiteSpace(groupId)) return;

        bool startTransmit = false;
        bool stopTransmit = false;
        bool monitorAfter = false;

        lock (_broadcastLock)
        {
            _broadcastMediaGroupId = groupId;
            _broadcastTransmitting = transmitting;

            startTransmit = transmitting;
            stopTransmit = !transmitting;
            monitorAfter = _broadcastMonitoring;
        }

        if (transmitting)
        {
            // When we start transmitting we aren't monitoring playback; ensure the VOX indicator is cleared.
            ClearBroadcastVox_NoThrow(groupId);
        }

        try
        {
            if (startTransmit)
            {
                // Transmit requires mic + downlink.
                await _broadcastRtpBridgeService.StartTransmitAsync(groupId);
                return;
            }

            if (stopTransmit)
            {
                if (monitorAfter)
                {
                    // Fall back to receive-only monitoring.
                    await _broadcastRtpBridgeService.StartReceiveOnlyAsync(groupId);
                }
                else
                {
                    // If not monitoring, stop completely.
                    await _broadcastRtpBridgeService.StopAsync(groupId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set broadcast transmitting media (groupId={GroupId}, transmitting={Transmitting})", groupId, transmitting);
        }
    }

    private void EnsureCallableOrThrow()
    {
        lock (_callLock)
        {
            if (_currentCall == null)
            {
                return;
            }

            if (_currentCall.State == CallState.Ended || _currentCall.State == CallState.Failed)
            {
                _currentCall = null;
                return;
            }

            if (_currentCall.State == CallState.Connected)
            {
                throw new InvalidOperationException("Already in a call");
            }

            _logger.LogWarning(
                "Clearing stale call before starting a new one: callId={CallId} state={State}",
                _currentCall.Id,
                _currentCall.State);
            _currentCall = null;
        }
    }

    public async Task<Call> StartCallAsync(string targetId, CallType callType, bool enableVideo = false)
    {
        EnsureCallableOrThrow();

        // Outgoing calls should start with microphone unmuted (receiver may auto-mute on incoming).
        _audioService.IsMuted = false;

        // Create a temporary call - the backend will provide the actual call ID in instant-connected
        var call = new Call
        {
            Id = "pending", // Will be updated when instant-connected is received
            Type = callType,
            State = CallState.Connecting,
            TargetId = targetId,
            TargetName = targetId,
            EnableVideo = enableVideo,
            StartTime = DateTime.UtcNow
        };

        call.IsMuted = false;

        _currentCall = call;

        lock (_speakerLock)
        {
            _speakers.Clear();
        }

        try
        {
            await _socketService.EmitCallAsync(targetId, callType, enableVideo);
            
            _logger.LogInformation("Call initiated to {TargetId}, waiting for connection...", targetId);
            CallStarted?.Invoke(this, call);
            CallStateChanged?.Invoke(this, call);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start call");
            call.State = CallState.Failed;
            CallStateChanged?.Invoke(this, call);
            _currentCall = null;
            throw;
        }

        return call;
    }

    public async Task<Call> StartConferenceAsync(IEnumerable<string> targetUserIds)
    {
        var targets = (targetUserIds ?? Array.Empty<string>())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (targets.Count == 0)
        {
            throw new InvalidOperationException("No target users specified");
        }

        EnsureCallableOrThrow();

        _audioService.IsMuted = false;

        var call = new Call
        {
            Id = "pending",
            Type = CallType.Conference,
            State = CallState.Connecting,
            GroupName = "Conference",
            StartTime = DateTime.UtcNow,
            Participants = targets
        };

        _currentCall = call;

        lock (_speakerLock)
        {
            _speakers.Clear();
        }

        try
        {
            await _socketService.EmitAsync("instant-connect", new
            {
                targetUserIds = targets,
                isGroupCall = true,
                policy = "REMAIN_GROUP",
                audioMode = "open",
                enableVideo = false
            });

            CallStarted?.Invoke(this, call);
            CallStateChanged?.Invoke(this, call);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start conference call");
            call.State = CallState.Failed;
            CallStateChanged?.Invoke(this, call);
            _currentCall = null;
            throw;
        }

        return call;
    }

    public async Task<Call> StartGroupCallAsync(string groupId, CallType callType)
    {
        EnsureCallableOrThrow();

        // Outgoing group calls should start with microphone unmuted.
        _audioService.IsMuted = false;

        var call = new Call
        {
            // Use a pending id so the server-assigned instant-* callId can replace it.
            Id = "pending",
            Type = callType,
            State = CallState.Ringing,
            GroupId = groupId,
            GroupName = groupId,
            StartTime = DateTime.UtcNow
        };

        _currentCall = call;

        lock (_speakerLock)
        {
            _speakers.Clear();
        }

        try
        {
            await _socketService.EmitCallAsync(groupId, callType);
            call.State = CallState.Connecting;
            
            _logger.LogInformation("Group call started: {CallId} to group {GroupId}", call.Id, groupId);
            CallStarted?.Invoke(this, call);
            CallStateChanged?.Invoke(this, call);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start group call");
            call.State = CallState.Failed;
            CallStateChanged?.Invoke(this, call);
            throw;
        }

        return call;
    }

    public async Task<Call> StartBroadcastAsync(string groupId, bool monitor = false)
    {
        EnsureCallableOrThrow();

        var call = new Call
        {
            Id = Guid.NewGuid().ToString(),
            Type = CallType.Broadcast,
            State = CallState.Connecting,
            GroupId = groupId,
            GroupName = groupId,
            LineName = groupId,
            IsMonitoring = monitor,
            StartTime = DateTime.UtcNow
        };

        _currentCall = call;

        lock (_speakerLock)
        {
            _speakers.Clear();
        }

        try
        {
            // Emit broadcast event via socket
            await _socketService.EmitAsync("broadcast-start", new { groupId, monitor });
            call.State = CallState.Connected;
            
            _logger.LogInformation("Broadcast started: {CallId} for group {GroupId}, Monitor: {Monitor}", call.Id, groupId, monitor);
            CallStarted?.Invoke(this, call);
            CallStateChanged?.Invoke(this, call);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start broadcast");
            call.State = CallState.Failed;
            CallStateChanged?.Invoke(this, call);
            throw;
        }

        return call;
    }

    public async Task ToggleBroadcastMonitorAsync(string callId, bool monitor)
    {
        if (_currentCall == null || _currentCall.Id != callId || _currentCall.Type != CallType.Broadcast)
        {
            return;
        }

        try
        {
            await _socketService.EmitAsync("broadcast-monitor", new { callId, groupId = _currentCall.GroupId, monitor });
            _currentCall.IsMonitoring = monitor;
            _logger.LogInformation("Broadcast monitor toggled: {CallId}, Monitor: {Monitor}", callId, monitor);
            CallStateChanged?.Invoke(this, _currentCall);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle broadcast monitor");
            throw;
        }
    }

    public async Task AnswerCallAsync(string callId)
    {
        if (_currentCall == null || _currentCall.Id != callId)
        {
            throw new InvalidOperationException("Call not found");
        }

        try
        {
            // Accept immediately; media streaming will be started when server emits webrtc-setup-required.
            await _socketService.EmitAnswerAsync(callId);
            
            _currentCall.State = CallState.Connecting;
            _logger.LogInformation("Call answered: {CallId}", callId);
            CallStateChanged?.Invoke(this, _currentCall);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to answer call");
            throw;
        }
    }

    public Task HangupCallAsync(string callId)
    {
        return HangupAsync(callId);
    }

    public async Task HangupAsync(string callId)
    {
        try
        {
            string? hangupId;
            Call? endedCall = null;

            lock (_callLock)
            {
                if (_currentCall == null)
                {
                    return;
                }

                // Single-call client: allow hangup even if the UI is holding an old id (e.g. "pending").
                // Always hang up the currently tracked call.
                hangupId = _currentCall.Id;

                _currentCall.State = CallState.Ended;
                _currentCall.EndTime = DateTime.UtcNow;

                lock (_speakerLock)
                {
                    _currentCall.Speakers = _speakers.ToList();
                }

                endedCall = _currentCall;
            }

            try
            {
                if (endedCall != null && endedCall.Type == CallType.Broadcast)
                {
                    var gid = endedCall.GroupId;
                    if (!string.IsNullOrWhiteSpace(gid))
                    {
                        await _broadcastRtpBridgeService.StopAsync(gid);
                    }
                }
            }
            catch { }

            // Ensure we always clear streaming state, even if ids mismatched (e.g. hangup while still "pending").
            lock (_callLock)
            {
                _streamingCallId = null;
            }

            // IMPORTANT:
            // Do NOT stop recording immediately on the caller side.
            // Otherwise the caller stops at local time, while the callee stops when it receives
            // instant-ended over Socket.IO (polling can lag), creating duration skew.
            // Instead, emit hangup first and stop when the server broadcasts call end.
            await _socketService.EmitHangupAsync(hangupId!);

            // Fallback: if for some reason the server call-ended event never arrives,
            // stop recording after a short grace period to avoid leaking recording state.
            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(3));
                    if (_callRecordingService.IsRecording)
                    {
                        await _callRecordingService.StopAndUploadAsync("hangup-timeout");
                    }
                }
                catch { }
            });

            _logger.LogInformation("Call ended: {CallId}", hangupId);
            CallEnded?.Invoke(this, hangupId!);

            if (endedCall != null)
            {
                CallStateChanged?.Invoke(this, endedCall);
            }

            // Keep _currentCall until the server emits instant-ended/instant-disconnected.
            // OnCallEnded will perform the final cleanup + recording stop.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to hangup call");
            throw;
        }
    }

    public async Task MuteCallAsync(string callId, bool muted)
    {
        Call? call;
        lock (_callLock)
        {
            call = _currentCall;
        }

        if (call == null)
        {
            return;
        }

        // Single-call client: allow mute even if UI holds an old id (e.g. "pending").
        // Apply to the currently tracked call.
        if (!string.Equals(call.Id, callId, StringComparison.OrdinalIgnoreCase) && !string.Equals(callId, "pending", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Mute callId mismatch. Current={CurrentId}, Requested={RequestedId}. Muting current call anyway.", call.Id, callId);
        }

        try
        {
            _audioService.IsMuted = muted;

            // Direct calls use the WebView2 mediasoup-client media engine.
            // Muting must be applied to the WebRTC producer, not just the native capture pipeline.
            if (call.Type != CallType.Broadcast)
            {
                try
                {
                    await _webMediaEngineService.SetMutedAsync(muted);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to apply mute to WebView2 media engine");
                }
            }

            await _socketService.EmitMuteAsync(call.Id, muted);
            
            call.IsMuted = muted;
            _logger.LogInformation("Call muted: {CallId}, {Muted}", call.Id, muted);
            CallStateChanged?.Invoke(this, call);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to mute call");
            throw;
        }
    }

    public Task HoldCallAsync(string callId, bool onHold)
    {
        if (_currentCall == null || _currentCall.Id != callId)
        {
            return Task.CompletedTask;
        }

        _currentCall.IsOnHold = onHold;
        _logger.LogInformation("Call hold: {CallId}, {OnHold}", callId, onHold);
        CallStateChanged?.Invoke(this, _currentCall);
        
        return Task.CompletedTask;
    }

    private void OnIncomingCall(object? sender, Call call)
    {
        lock (_callLock)
        {
            _currentCall = call;
        }
        _logger.LogInformation("Incoming call received: {CallId}", call.Id);

        try
        {
            // Incoming calls start muted. Users must latch/PTT to transmit.
            // Outgoing calls are handled in StartCallAsync/StartGroupCallAsync (unmuted by default).
            if (call.Type == CallType.Broadcast)
            {
                _audioService.IsMuted = false;
                call.IsMuted = false;
            }
            else
            {
                _audioService.IsMuted = true;
                call.IsMuted = true;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to auto-mute microphone for incoming call: {CallId}", call.Id);
        }

        CallStarted?.Invoke(this, call);
        CallStateChanged?.Invoke(this, call);

        // Instant intercom calls auto-accept; kick off media setup immediately.
        if (call.State == CallState.Ringing)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await AnswerCallAsync(call.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Auto-answer failed for call: {CallId}", call.Id);
                }
            });
        }
    }

    private void OnCallStateChanged(object? sender, Call call)
    {
        Call? updated = null;
        bool shouldEmit = false;

        lock (_callLock)
        {
            // Update current call if it matches, or if we are in a pending outgoing call and server assigns a real callId
            if (_currentCall == null)
            {
                _currentCall = call;
                updated = call;
                shouldEmit = true;
            }
            else if (_currentCall.Id == call.Id)
            {
                _currentCall = call;
                updated = call;
                shouldEmit = true;
            }
            else if (_currentCall.Id == "pending" && (call.State == CallState.Connected || call.State == CallState.Connecting))
            {
                // IMPORTANT: Replace pending only once. After replacement, ignore further mismatched callIds.
                _logger.LogInformation("Replacing pending call with server callId: {OldId} -> {NewId}", _currentCall.Id, call.Id);
                _currentCall = call;
                updated = call;
                shouldEmit = true;
            }
        }

        if (shouldEmit && updated != null)
        {
            CallStateChanged?.Invoke(this, updated);
        }
    }

    private void OnWebRTCSetupRequired(object? sender, WebRTCSetupData data)
    {
        if (data == null || string.IsNullOrWhiteSpace(data.CallId))
        {
            return;
        }

        _logger.LogInformation("OnWebRTCSetupRequired received: callId={CallId} participants={ParticipantCount}", data.CallId, data.Participants?.Count ?? 0);

        // Server requests WebRTC setup once the call is active.
        // Start MediaSoup + audio streaming here for BOTH incoming and outgoing calls.
        _ = Task.Run(async () =>
        {
            try
            {
                Call? activeCall;
                string? alreadyStreaming;
                bool? alreadyStreamingVideo;
                Call? connectedSnapshot = null;
                lock (_callLock)
                {
                    activeCall = _currentCall;
                    alreadyStreaming = _streamingCallId;
                    alreadyStreamingVideo = _streamingEnableVideo;

                    // If WebRTC is being set up for the active call, treat it as connected for UI purposes.
                    if (activeCall != null
                        && (activeCall.Id == data.CallId || activeCall.Id == "pending")
                        && activeCall.State != CallState.Connected
                        && activeCall.State != CallState.Ended)
                    {
                        // IMPORTANT: Call does not implement INotifyPropertyChanged.
                        // Replace the instance so WPF bindings (CurrentCall.State) update reliably.
                        connectedSnapshot = new Call
                        {
                            Id = data.CallId,
                            Type = activeCall.Type,
                            State = CallState.Connected,
                            TargetId = activeCall.TargetId,
                            TargetName = activeCall.TargetName,
                            CallerId = activeCall.CallerId,
                            CallerName = activeCall.CallerName,
                            GroupId = activeCall.GroupId,
                            GroupName = activeCall.GroupName,
                            LineName = activeCall.LineName,
                            EnableVideo = activeCall.EnableVideo,
                            IsMonitoring = activeCall.IsMonitoring,
                            StartTime = activeCall.StartTime,
                        };
                        connectedSnapshot.Participants = activeCall.Participants;
                        _currentCall = connectedSnapshot;
                        activeCall = connectedSnapshot;
                    }
                }

                if (connectedSnapshot != null)
                {
                    CallStateChanged?.Invoke(this, connectedSnapshot);
                }

                if (activeCall == null)
                {
                    _logger.LogWarning("OnWebRTCSetupRequired ignored: no active call. callId={CallId}", data.CallId);
                    return;
                }

                // Only start streaming for the active call (or if we're still pending during id reconciliation).
                if (activeCall.Id != data.CallId && activeCall.Id != "pending")
                {
                    _logger.LogWarning(
                        "OnWebRTCSetupRequired ignored: activeCallId mismatch. activeCallId={ActiveCallId} eventCallId={EventCallId} state={State}",
                        activeCall.Id,
                        data.CallId,
                        activeCall.State);
                    return;
                }

                var requestedVideo = activeCall.EnableVideo;
                var sameStream = string.Equals(alreadyStreaming, data.CallId, StringComparison.OrdinalIgnoreCase);
                var sameVideo = alreadyStreamingVideo.HasValue && alreadyStreamingVideo.Value == requestedVideo;

                // If WebRTC setup arrives again for the same call and video state changed,
                // restart the media engine to upgrade (voice -> video) without creating a new call.
                if (sameStream && sameVideo)
                {
                    _logger.LogInformation(
                        "OnWebRTCSetupRequired: media already streaming. callId={CallId} enableVideo={EnableVideo}",
                        data.CallId,
                        requestedVideo);
                    return;
                }

                lock (_callLock)
                {
                    // Re-check under lock to prevent duplicate starts.
                    var sameStreamLocked = string.Equals(_streamingCallId, data.CallId, StringComparison.OrdinalIgnoreCase);
                    var sameVideoLocked = _streamingEnableVideo.HasValue && _streamingEnableVideo.Value == requestedVideo;

                    if (sameStreamLocked && sameVideoLocked)
                    {
                        return;
                    }

                    _streamingCallId = data.CallId;
                    _streamingEnableVideo = requestedVideo;
                }

                if (!_mediaSoupService.IsInitialized)
                {
                    await _mediaSoupService.InitializeAsync();
                }

                _logger.LogInformation(
                    "OnWebRTCSetupRequired starting media. callId={CallId} callType={CallType} enableVideo={EnableVideo}",
                    data.CallId,
                    activeCall.Type,
                    activeCall.EnableVideo);

                // Start or continue recording for the same call
                // When switching from voice to video, continue the existing recording instead of starting a new one
                try
                {
                    Call? toRecord;
                    Call? activeBroadcastRecording;
                    lock (_callLock)
                    {
                        toRecord = _currentCall;
                    }
                    lock (_broadcastLock)
                    {
                        activeBroadcastRecording = _broadcastRecordingCall;
                    }

                    if (toRecord != null && toRecord.Type != CallType.Broadcast && _callRecordingService.IsRecording && activeBroadcastRecording != null)
                    {
                        try
                        {
                            await _callRecordingService.StopAndUploadAsync("switch-to-direct");
                        }
                        catch { }

                        lock (_broadcastLock)
                        {
                            _broadcastRecordingCall = null;
                            _broadcastRecordingSpeakers.Clear();
                        }
                    }

                    if (toRecord != null)
                    {
                        // Only start recording if not already recording for this call
                        // This ensures voice->video transitions continue the same recording
                        if (!_callRecordingService.IsRecording)
                        {
                            await _callRecordingService.StartAsync(toRecord);
                        }
                        else
                        {
                            // Recording already in progress - ensure it's for the same call
                            // The recording service will continue with the existing recording
                            _logger.LogDebug("Recording already in progress for call {CallId}, continuing existing recording", toRecord.Id);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to start client recording");
                }

                // For direct/conference calls, use the WebView2 mediasoup-client media engine.
                // Broadcast still uses the RTP bridge (handled by SetBroadcast* methods).
                if (activeCall.Type == CallType.Broadcast)
                {
                    try
                    {
                        string? gid;
                        bool monitor;
                        bool transmit;
                        lock (_broadcastLock)
                        {
                            gid = _broadcastMediaGroupId;
                            monitor = _broadcastMonitoring;
                            transmit = _broadcastTransmitting;
                        }

                        if (!string.IsNullOrWhiteSpace(gid))
                        {
                            if (transmit)
                            {
                                await _broadcastRtpBridgeService.StartTransmitAsync(gid);
                            }
                            else if (monitor)
                            {
                                await _broadcastRtpBridgeService.StartReceiveOnlyAsync(gid);
                            }
                        }
                    }
                    catch { }
                }
                else
                {
                    try
                    {
                        // If this is a re-setup (e.g. enable video), stop existing call media first.
                        // Best-effort; StartCallAsync should still succeed even if StopCallAsync fails.
                        await _webMediaEngineService.StopCallAsync(data.CallId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Failed to stop WebView2 media engine call prior to restart (callId={CallId})", data.CallId);
                    }

                    await _webMediaEngineService.StartCallAsync(data.CallId, activeCall.EnableVideo);
                }

                _logger.LogInformation("Started outgoing media streaming for call: {CallId}", data.CallId);
            }
            catch (Exception ex)
            {
                lock (_callLock)
                {
                    if (string.Equals(_streamingCallId, data.CallId, StringComparison.OrdinalIgnoreCase))
                    {
                        _streamingCallId = null;
                        _streamingEnableVideo = null;
                    }
                }
                _logger.LogError(ex, "Failed to start outgoing media streaming (callId={CallId})", data.CallId);
            }
        });
    }

    private void OnCallEnded(object? sender, string callId)
    {
        Call? endedCall = null;
        bool shouldStopBroadcastBridge = true;
        string? broadcastGroupIdToStop = null;
        lock (_callLock)
        {
            if (_currentCall == null)
            {
                return;
            }

            // Single-call client: if any end/disconnect arrives while a call is active,
            // close it even if ids don't match (the server can emit different ids during setup).
            // We still log mismatches to aid debugging.
            if (_currentCall.Id != callId && _currentCall.Id != "pending")
            {
                _logger.LogWarning("Call end event callId mismatch. Current={CurrentId}, Event={EventId}. Closing current call anyway.", _currentCall.Id, callId);
            }

            try
            {
                _webMediaEngineService.StopAllAsync().Wait(TimeSpan.FromSeconds(1));
                try
                {
                    // Broadcast monitoring/transmit uses the RTP bridge independently of 1-to-1 calls.
                    // Ending a direct/conference call must not kill broadcast audio.
                    lock (_broadcastLock)
                    {
                        shouldStopBroadcastBridge = _currentCall?.Type == CallType.Broadcast || (!_broadcastMonitoring && !_broadcastTransmitting);
                        broadcastGroupIdToStop = _currentCall?.Type == CallType.Broadcast ? _broadcastMediaGroupId : null;
                    }
                }
                catch { }

                if (shouldStopBroadcastBridge && !string.IsNullOrWhiteSpace(broadcastGroupIdToStop))
                {
                    _broadcastRtpBridgeService.StopAsync(broadcastGroupIdToStop).Wait(TimeSpan.FromSeconds(1));
                }
                _mediaSoupService.CleanupAsync().Wait(TimeSpan.FromSeconds(2));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cleanup failed while ending call");
            }

            try
            {
                _callRecordingService.StopAndUploadAsync("ended").Wait(TimeSpan.FromSeconds(5));
            }
            catch { }

            _currentCall.State = CallState.Ended;
            _currentCall.EndTime = DateTime.UtcNow;

            lock (_speakerLock)
            {
                _currentCall.Speakers = _speakers.ToList();
            }

            endedCall = _currentCall;
            _currentCall = null;
            _streamingCallId = null;
            _streamingEnableVideo = null;
        }

        // Reset mic mute after the call ends so subsequent outgoing calls are not silent.
        try
        {
            _audioService.IsMuted = false;
        }
        catch { }

        // Emit outside lock.
        CallEnded?.Invoke(this, callId);
        if (endedCall != null)
        {
            CallStateChanged?.Invoke(this, endedCall);
        }
    }

    private void OnMediaSoupConnectionChanged(object? sender, bool isConnected)
    {
        _logger.LogInformation("MediaSoup connection state changed: {IsConnected}", isConnected);
    }

    private void OnMediaSoupError(object? sender, string error)
    {
        _logger.LogError("MediaSoup error: {Error}", error);
    }

    private void OnAudioLevelReceived(object? sender, AudioLevelData data)
    {
        try
        {
            if (data == null || string.IsNullOrWhiteSpace(data.CallId) || string.IsNullOrWhiteSpace(data.UserId))
            {
                return;
            }

            if (data.Level <= 0.02f)
            {
                return;
            }

            lock (_callLock)
            {
                if (_currentCall == null) return;
                if (!string.Equals(_currentCall.Id, data.CallId, StringComparison.OrdinalIgnoreCase) && _currentCall.Id != "pending") return;
            }

            lock (_speakerLock)
            {
                _speakers.Add(data.UserId);
            }

            // For broadcast monitoring recordings, we track who spoke by listening to audio-level events
            // where callId matches the monitored broadcast groupId.
            string? broadcastGroupId;
            bool monitoring;
            lock (_broadcastLock)
            {
                broadcastGroupId = _broadcastMediaGroupId;
                monitoring = _broadcastMonitoring;
            }

            if (monitoring && !string.IsNullOrWhiteSpace(broadcastGroupId)
                && string.Equals(broadcastGroupId, data.CallId, StringComparison.OrdinalIgnoreCase))
            {
                lock (_broadcastLock)
                {
                    if (_broadcastRecordingCall != null)
                    {
                        _broadcastRecordingSpeakers.Add(data.UserId);
                        _broadcastRecordingCall.Speakers = _broadcastRecordingSpeakers.ToList();
                        
                        // Update participants: current user + all speakers
                        var currentUserId = _authService.CurrentUser?.Id;
                        if (!string.IsNullOrWhiteSpace(currentUserId))
                        {
                            var participants = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { currentUserId };
                            foreach (var speaker in _broadcastRecordingSpeakers)
                            {
                                participants.Add(speaker);
                            }
                            _broadcastRecordingCall.Participants = participants.ToList();
                        }
                    }
                }
            }
        }
        catch { }
    }
}

