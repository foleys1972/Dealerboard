using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace TradePulse.Dealerboard.Client;

public class BooleanToColorConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool boolValue)
        {
            // Return a SolidColorBrush for Background binding
            return new SolidColorBrush(boolValue ? Colors.Green : Colors.Gray);
        }
        return new SolidColorBrush(Colors.Gray);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}


