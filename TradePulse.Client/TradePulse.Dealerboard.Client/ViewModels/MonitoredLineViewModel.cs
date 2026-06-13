using CommunityToolkit.Mvvm.ComponentModel;

namespace TradePulse.Dealerboard.Client.ViewModels;

public sealed partial class MonitoredLineViewModel : ObservableObject
{
    public string LineId { get; }
    public string Label { get; }
    public int ButtonNumber { get; }
    public int PageNumber { get; }

    public string PositionLabel => ButtonNumber > 0 ? $"{ButtonNumber}-{PageNumber}" : "—";

    public bool IsEmpty => string.IsNullOrWhiteSpace(LineId);

    // Push-to-talk active on this monitored line (mic uplink live).
    [ObservableProperty]
    private bool _isTalking;

    public MonitoredLineViewModel(string lineId, string label, int buttonNumber, int pageNumber)
    {
        LineId = lineId;
        Label = label;
        ButtonNumber = buttonNumber;
        PageNumber = pageNumber;
    }
}
