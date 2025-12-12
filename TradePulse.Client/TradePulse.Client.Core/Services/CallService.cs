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
    private Call? _currentCall;

    public Call? CurrentCall => _currentCall;
    public bool IsInCall => _currentCall != null && _currentCall.State == CallState.Connected;

    public event EventHandler<Call>? CallStarted;
    public event EventHandler<Call>? CallStateChanged;
    public event EventHandler<string>? CallEnded;

    public CallService(
        ILogger<CallService> logger,
        ISocketService socketService,
        IAudioService audioService,
        IAudioStreamingService audioStreamingService,
        IMediaSoupService mediaSoupService)
    {
        _logger = logger;
        _socketService = socketService;
        _audioService = audioService;
        _audioStreamingService = audioStreamingService;
        _mediaSoupService = mediaSoupService;

        // Subscribe to socket events
        _socketService.IncomingCall += OnIncomingCall;
        _socketService.CallStateChanged += OnCallStateChanged;
        _socketService.CallEnded += OnCallEnded;
        
        // Subscribe to MediaSoup events
        _mediaSoupService.ConnectionStateChanged += OnMediaSoupConnectionChanged;
        _mediaSoupService.Error += OnMediaSoupError;
    }

    public async Task<Call> StartCallAsync(string targetId, CallType callType, bool enableVideo = false)
    {
        if (_currentCall != null && _currentCall.State != CallState.Ended)
        {
            throw new InvalidOperationException("Already in a call");
        }

        // Create a temporary call - the backend will provide the actual call ID in instant-connected
        var call = new Call
        {
            Id = "pending", // Will be updated when instant-connected is received
            Type = callType,
            State = CallState.Connecting,
            TargetId = targetId,
            StartTime = DateTime.UtcNow
        };

        _currentCall = call;

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

    public async Task<Call> StartGroupCallAsync(string groupId, CallType callType)
    {
        if (_currentCall != null && _currentCall.State != CallState.Ended)
        {
            throw new InvalidOperationException("Already in a call");
        }

        var call = new Call
        {
            Id = Guid.NewGuid().ToString(),
            Type = callType,
            State = CallState.Ringing,
            GroupId = groupId,
            StartTime = DateTime.UtcNow
        };

        _currentCall = call;

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
        if (_currentCall != null && _currentCall.State != CallState.Ended)
        {
            throw new InvalidOperationException("Already in a call");
        }

        var call = new Call
        {
            Id = Guid.NewGuid().ToString(),
            Type = CallType.Broadcast,
            State = CallState.Connecting,
            GroupId = groupId,
            IsMonitoring = monitor,
            StartTime = DateTime.UtcNow
        };

        _currentCall = call;

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
            // Initialize MediaSoup if not already initialized
            if (!_mediaSoupService.IsInitialized)
            {
                await _mediaSoupService.InitializeAsync();
            }

            await _audioService.InitializeAsync();
            await _audioStreamingService.StartStreamingAsync(callId);
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

    public async Task HangupCallAsync(string callId)
    {
        if (_currentCall == null || _currentCall.Id != callId)
        {
            return;
        }

        try
        {
            await _audioStreamingService.StopStreamingAsync();
            await _socketService.EmitHangupAsync(callId);
            
            _currentCall.State = CallState.Ended;
            _currentCall.EndTime = DateTime.UtcNow;
            
            _logger.LogInformation("Call ended: {CallId}", callId);
            CallEnded?.Invoke(this, callId);
            CallStateChanged?.Invoke(this, _currentCall);
            
            _currentCall = null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to hangup call");
            throw;
        }
    }

    public async Task MuteCallAsync(string callId, bool muted)
    {
        if (_currentCall == null || _currentCall.Id != callId)
        {
            return;
        }

        try
        {
            _audioService.IsMuted = muted;
            await _socketService.EmitMuteAsync(callId, muted);
            
            _currentCall.IsMuted = muted;
            _logger.LogInformation("Call muted: {CallId}, {Muted}", callId, muted);
            CallStateChanged?.Invoke(this, _currentCall);
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
        _currentCall = call;
        _logger.LogInformation("Incoming call received: {CallId}", call.Id);
        CallStarted?.Invoke(this, call);
    }

    private void OnCallStateChanged(object? sender, Call call)
    {
        // Update current call if it matches, or set it if we don't have one yet
        if (_currentCall == null || _currentCall.Id == call.Id)
        {
            _currentCall = call;
            CallStateChanged?.Invoke(this, call);
        }
    }

    private void OnCallEnded(object? sender, string callId)
    {
        if (_currentCall?.Id == callId)
        {
            _audioStreamingService.StopStreamingAsync().Wait(TimeSpan.FromSeconds(1));
            _mediaSoupService.CleanupAsync().Wait(TimeSpan.FromSeconds(2));
            _currentCall.State = CallState.Ended;
            _currentCall.EndTime = DateTime.UtcNow;
            
            CallEnded?.Invoke(this, callId);
            CallStateChanged?.Invoke(this, _currentCall);
            
            _currentCall = null;
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
}

