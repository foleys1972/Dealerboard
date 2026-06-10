using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace TradePulse.Client.WPF.Converters;

public class StatusToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is string status)
        {
            var amber = Color.FromRgb(0xFF, 0xAA, 0x44);
            var color = status?.ToLower() switch
            {
                "online" => Colors.Green,
                "available" => Colors.Green,
                "busy" => amber,
                "away" => amber,
                "dnd" => amber,
                "oncall" => Colors.Red,
                "in-call" => Colors.Red,
                "incall" => Colors.Red,
                "offline" => Colors.Gray,
                _ => Colors.Gray
            };

            return new SolidColorBrush(color);
        }
        return new SolidColorBrush(Colors.Gray);
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

