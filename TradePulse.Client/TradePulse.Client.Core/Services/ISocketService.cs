using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface ISocketService
{
    bool IsConnected { get; }
    string? SocketId { get; }
    
    event EventHandler<bool>? ConnectionStateChanged;
    event EventHandler<User>? UserStatusChanged;
    event EventHandler<Call>? IncomingCall;
    event EventHandler<Call>? CallStateChanged;
    event EventHandler<string>? CallEnded;
    event EventHandler<WebRTCSetupData>? WebRTCSetupRequired;
    event EventHandler<AudioLevelData>? AudioLevelReceived;
    event EventHandler<(string LineId, bool IsActive)>? BroadcastActiveChanged;
    event EventHandler<(string LineId, bool IsMonitoring, int? ListenerCount)>? BroadcastMonitorUpdated;
    event EventHandler<LineSipStateEvent>? LineSipStateChanged;
    event EventHandler<LineSipStateEvent>? LineSipIncoming;
    event EventHandler<string>? Error;
    
    Task ConnectAsync(string serverUrl, string? token = null);
    Task DisconnectAsync();
    Task AuthenticateAsync(string userId, string username, string token);

    void SetServerCandidates(IEnumerable<string> serverUrls);
    
    Task EmitCallAsync(string targetId, CallType callType, bool enableVideo = false);
    Task EmitAnswerAsync(string callId);
    Task EmitHangupAsync(string callId);
    Task EmitMuteAsync(string callId, bool muted);
    Task EmitJoinRoomAsync(string roomId);
    Task EmitAsync(string eventName, object data);
    
    void On(string eventName, Action<object> handler);
    void Off(string eventName);
}

public class WebRTCSetupData
{
    public string CallId { get; set; } = string.Empty;
    public List<string> Participants { get; set; } = new();
}

public class AudioLevelData
{
    public string CallId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public float Level { get; set; }
}

