namespace TradePulse.Dealerboard.Client.Models;

public sealed class LineCallResult
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public string? MatrixRoomId { get; set; }
    public string? MediaGroupId { get; set; }
    public string? SipCallId { get; set; }
    public bool JoinedExistingCall { get; set; }
    public bool Ringing { get; set; }
    public string? LineMode { get; set; }
    public int ActiveUsers { get; set; }
    public string? SessionId { get; set; }
}
