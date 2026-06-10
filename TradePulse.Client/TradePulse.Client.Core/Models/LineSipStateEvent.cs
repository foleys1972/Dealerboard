namespace TradePulse.Client.Core.Models;

/// <summary>
/// Real-time logical SIP line state from the server (line-sip-state / line-sip-incoming).
/// </summary>
public sealed class LineSipStateEvent
{
    public string LineId { get; set; } = string.Empty;
    public string? LineSessionKey { get; set; }
    public string? MediaGroupId { get; set; }
    public string? SipCallId { get; set; }
    public string? Status { get; set; }
    public string? Reason { get; set; }
    public string? SbcRole { get; set; }
    public int ActiveUsers { get; set; }
    public bool IsIncoming { get; set; }
}
