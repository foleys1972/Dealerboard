using System;
using System.Globalization;
using System.Windows.Data;

namespace TradePulse.Dealerboard.Client.Converters;

/// <summary>
/// Computes a uniform scale factor to fit within available width/height, but never scales above 1.0.
/// MultiBinding inputs:
/// 0 = availableWidth (double)
/// 1 = availableHeight (double)
/// 2 = baselineWidth (double)
/// 3 = baselineHeight (double)
/// </summary>
public sealed class ScaleToFitDownOnlyConverter : IMultiValueConverter
{
    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        try
        {
            if (values == null || values.Length < 4) return 1.0;

            var aw = values[0] is double d0 ? d0 : System.Convert.ToDouble(values[0], CultureInfo.InvariantCulture);
            var ah = values[1] is double d1 ? d1 : System.Convert.ToDouble(values[1], CultureInfo.InvariantCulture);
            var bw = values[2] is double d2 ? d2 : System.Convert.ToDouble(values[2], CultureInfo.InvariantCulture);
            var bh = values[3] is double d3 ? d3 : System.Convert.ToDouble(values[3], CultureInfo.InvariantCulture);

            if (aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 1.0;

            var s = Math.Min(aw / bw, ah / bh);
            if (double.IsNaN(s) || double.IsInfinity(s)) return 1.0;
            return Math.Min(1.0, Math.Max(0.1, s));
        }
        catch
        {
            return 1.0;
        }
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}


