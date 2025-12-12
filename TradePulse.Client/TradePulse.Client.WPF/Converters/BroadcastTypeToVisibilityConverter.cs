using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.WPF.Converters;

public class BroadcastTypeToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is CallType callType && callType == CallType.Broadcast)
        {
            return Visibility.Visible;
        }
        return Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

