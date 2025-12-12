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
            return status?.ToLower() switch
            {
                "online" => Colors.Green,
                "offline" => Colors.Gray,
                "away" => Colors.Orange,
                "busy" => Colors.Red,
                _ => Colors.Gray
            };
        }
        return Colors.Gray;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

