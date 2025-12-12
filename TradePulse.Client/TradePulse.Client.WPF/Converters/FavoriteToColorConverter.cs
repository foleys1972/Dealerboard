using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace TradePulse.Client.WPF.Converters;

public class FavoriteToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is bool isFavorite && isFavorite)
        {
            return Colors.Gold;
        }
        return Colors.LightGray;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

