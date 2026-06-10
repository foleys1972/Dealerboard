using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace TradePulse.Dealerboard.Client.Converters;

public sealed class StatusToColorConverter : IValueConverter
{
    private static readonly SolidColorBrush Offline = new(Color.FromRgb(0x66, 0x66, 0x66));
    private static readonly SolidColorBrush Available = new(Color.FromRgb(0x22, 0xC5, 0x5E));
    private static readonly SolidColorBrush Busy = new(Color.FromRgb(0xEF, 0x44, 0x44));
    private static readonly SolidColorBrush Away = new(Color.FromRgb(0xF5, 0x9E, 0x0B));

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var status = (value as string ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(status)) return Offline;

        if (status.Equals("online", StringComparison.OrdinalIgnoreCase)
            || status.Equals("available", StringComparison.OrdinalIgnoreCase))
        {
            return Available;
        }

        if (status.Equals("busy", StringComparison.OrdinalIgnoreCase)
            || status.Equals("in_call", StringComparison.OrdinalIgnoreCase)
            || status.Equals("incall", StringComparison.OrdinalIgnoreCase)
            || status.Equals("ringing", StringComparison.OrdinalIgnoreCase))
        {
            return Busy;
        }

        if (status.Equals("away", StringComparison.OrdinalIgnoreCase)
            || status.Equals("idle", StringComparison.OrdinalIgnoreCase)
            || status.Equals("dnd", StringComparison.OrdinalIgnoreCase))
        {
            return Away;
        }

        if (status.Equals("offline", StringComparison.OrdinalIgnoreCase))
        {
            return Offline;
        }

        return Offline;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => Binding.DoNothing;
}
