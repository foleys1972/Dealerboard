namespace TradePulse.Dealerboard.Client.Models;

public sealed class MonitorLineResult
{
    public bool Success { get; set; }
    public string? MediaGroupId { get; set; }
    public string? MatrixRoomId { get; set; }
    public string? SessionId { get; set; }
}
