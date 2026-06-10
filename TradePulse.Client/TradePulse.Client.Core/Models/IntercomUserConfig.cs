namespace TradePulse.Client.Core.Models;

public class IntercomUserConfig
{
    public bool IntercomEnabled { get; set; } = true;
    public List<IntercomAllowedGroup> AllowedBroadcastGroups { get; set; } = new();
    public List<IntercomBroadcastLineSlot> BroadcastSlots { get; set; } = new();
    public List<IntercomGroupCallSlot> GroupCallSlots { get; set; } = new();
}
