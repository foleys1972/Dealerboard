using System.Collections.Generic;

namespace TradePulse.Dealerboard.Client.Models;

/// <summary>
/// Intercom button assignments from dealerboard_button_assignments page 0.
/// </summary>
public class IntercomButtonAssignments
{
    public Dictionary<int, ButtonAssignment> Broadcasts { get; set; } = new();
    public Dictionary<int, ButtonAssignment> Groups { get; set; } = new();
    public Dictionary<int, ButtonAssignment> Contacts { get; set; } = new();
}
