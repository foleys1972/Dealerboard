namespace TradePulse.Client.Core.Models;

/// <summary>
/// Intercom button slots from dealerboard_button_assignments (page_number = 0).
/// Single source of truth — matches Admin Portal Configure Buttons → Intercom.
/// </summary>
public class IntercomButtonLayout
{
    public List<IntercomBroadcastLineSlot> BroadcastSlots { get; set; } = new();
    public List<IntercomGroupCallSlot> GroupCallSlots { get; set; } = new();
    public List<IntercomContactSlot> ContactSlots { get; set; } = new();
}
