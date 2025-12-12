using System;
using System.Globalization;
using System.Windows.Data;

namespace TradePulse.Client.WPF.Converters;

public class StatusToTitleCaseConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is string status && !string.IsNullOrEmpty(status))
        {
            // Convert to title case (first letter uppercase, rest lowercase)
            return culture.TextInfo.ToTitleCase(status.ToLower());
        }
        return value ?? string.Empty;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

