using System;
using System.Globalization;
using System.Windows.Data;

namespace TradePulse.Dealerboard.Client.Converters;

public class NullToBooleanConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        // Convert null to false, non-null to true
        return value != null;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}


