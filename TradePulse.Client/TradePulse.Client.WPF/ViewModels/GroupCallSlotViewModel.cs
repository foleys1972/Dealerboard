namespace TradePulse.Client.WPF.ViewModels;

public class GroupCallSlotViewModel
{
    public int SlotIndex { get; set; }
    public string GroupId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsConfigured { get; set; }
}
