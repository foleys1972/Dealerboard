using System.Text.Json;

namespace TradePulse.Dealerboard.Client.Models;

public class ButtonAssignment
{
    public string Id { get; set; } = string.Empty;
    public string AssignmentType { get; set; } = string.Empty; // "privateWire", "ddiLine", "speedDial", "broadcast"
    public string? LineId { get; set; }
    public string? DdiLineId { get; set; }
    public string? SpeedDialId { get; set; }
    public string? BroadcastId { get; set; }
    public string? GroupId { get; set; }
    public string? ContactUserId { get; set; }

    // Per-button metadata (Admin Portal stores things like speed dial button label here)
    public JsonElement Metadata { get; set; }
}


