using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface ICallService
{
    Call? CurrentCall { get; }
    bool IsInCall { get; }
    
    event EventHandler<Call>? CallStarted;
    event EventHandler<Call>? CallStateChanged;
    event EventHandler<string>? CallEnded;
    
    Task<Call> StartCallAsync(string targetId, CallType callType, bool enableVideo = false);
    Task<Call> StartGroupCallAsync(string groupId, CallType callType);
    Task<Call> StartBroadcastAsync(string groupId, bool monitor = false);
    Task AnswerCallAsync(string callId);
    Task HangupCallAsync(string callId);
    Task MuteCallAsync(string callId, bool muted);
    Task HoldCallAsync(string callId, bool onHold);
    Task ToggleBroadcastMonitorAsync(string callId, bool monitor);
}

