using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using TradePulse.Client.WPF.ViewModels;

namespace TradePulse.Client.WPF.Views.MainWindowParts;

public partial class BroadcastMonitorsPanel : Border
{
    public BroadcastMonitorsPanel()
    {
        InitializeComponent();
    }

    private void BroadcastPttButton_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is not MainViewModel vm)
        {
            return;
        }

        if (sender is not FrameworkElement element || element.DataContext is not BroadcastViewModel broadcast)
        {
            return;
        }

        if (vm.BroadcastPttDownCommand.CanExecute(broadcast))
        {
            vm.BroadcastPttDownCommand.Execute(broadcast);
        }
    }

    private void BroadcastPttButton_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is not MainViewModel vm)
        {
            return;
        }

        if (sender is not FrameworkElement element || element.DataContext is not BroadcastViewModel broadcast)
        {
            return;
        }

        if (vm.BroadcastPttUpCommand.CanExecute(broadcast))
        {
            vm.BroadcastPttUpCommand.Execute(broadcast);
        }
    }
}
