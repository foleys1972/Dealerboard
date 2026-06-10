using System;
using CommunityToolkit.Mvvm.ComponentModel;
using MaterialDesignThemes.Wpf;

namespace TradePulse.Client.WPF.ViewModels;

public partial class NotificationItemViewModel : ObservableObject
{
    [ObservableProperty]
    private DateTimeOffset _timestamp;

    [ObservableProperty]
    private PackIconKind _iconKind;

    [ObservableProperty]
    private string _title = string.Empty;

    [ObservableProperty]
    private string _message = string.Empty;

    public string TimestampText => Timestamp.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss");
}
