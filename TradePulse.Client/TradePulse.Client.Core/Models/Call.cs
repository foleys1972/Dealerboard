namespace TradePulse.Client.Core.Models;

public enum CallType
{
    Direct,      // 1-to-1 call
    Hunt,        // Hunt group call
    Conference,  // Multi-party conference
    Broadcast    // Broadcast call (one-to-many)
}

public enum CallState
{
    Idle,
    Ringing,
    Connecting,
    Connected,
    Ended,
    Failed
}

public class Call
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public CallType Type { get; set; }
    public CallState State { get; set; } = CallState.Idle;
    public string? CallerId { get; set; }
    public string? CallerName { get; set; }
    public string? TargetId { get; set; }
    public string? TargetName { get; set; }
    public string? GroupId { get; set; }
    public string? GroupName { get; set; }
    public string? LineName { get; set; }
    public List<string> Participants { get; set; } = new();
    public List<string> Speakers { get; set; } = new();
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public bool IsMuted { get; set; }
    public bool IsOnHold { get; set; }
    public bool IsMonitoring { get; set; } // For broadcast monitoring
    public bool EnableVideo { get; set; }
}

