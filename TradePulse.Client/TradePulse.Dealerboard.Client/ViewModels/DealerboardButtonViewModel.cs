using CommunityToolkit.Mvvm.ComponentModel;
using TradePulse.Dealerboard.Client.Models;

namespace TradePulse.Dealerboard.Client.ViewModels;

public partial class DealerboardButtonViewModel : ObservableObject
{
    public int ButtonNumber { get; }

    [ObservableProperty]
    private string _pageLabel = string.Empty;

    [ObservableProperty]
    private string _displayLabel = string.Empty;

    [ObservableProperty]
    private string _subLabel = string.Empty;

    [ObservableProperty]
    private bool _isMonitoring;

    [ObservableProperty]
    private bool _isPrivate;

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private bool _isRinging;

    [ObservableProperty]
    private bool _isDisconnected;

    public ButtonAssignment? Assignment { get; private set; }

    public DealerboardButtonViewModel(int buttonNumber)
    {
        ButtonNumber = buttonNumber;
        PageLabel = buttonNumber.ToString();
    }

    public void Apply(ButtonAssignment? assignment, string displayLabel, string subLabel)
    {
        Assignment = assignment;
        DisplayLabel = displayLabel ?? string.Empty;
        SubLabel = subLabel ?? string.Empty;
    }

    public void SetPageNumber(int pageNumber)
    {
        PageLabel = $"{ButtonNumber}-{pageNumber}";
    }
}
