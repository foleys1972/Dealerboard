using System.Collections.Generic;

namespace TradePulse.Dealerboard.Client.Models;

public class DealerboardConfig
{
    public Dictionary<int, Dictionary<int, ButtonAssignment>> Assignments { get; set; } = new();
    public IntercomButtonAssignments Intercom { get; set; } = new();
    public DealerboardPreferences Preferences { get; set; } = new();
}

public class DealerboardPreferences
{
    public bool AudibleRinging { get; set; } = true;
    public Dictionary<string, object> ButtonColors { get; set; } = new();
    public Dictionary<string, object> Preferences { get; set; } = new();
    public string? DefaultDdiLineId { get; set; }
}


