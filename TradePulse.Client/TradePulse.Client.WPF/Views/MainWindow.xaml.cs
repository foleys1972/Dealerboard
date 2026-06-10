using System.Windows;
using System.Windows.Input;
using TradePulse.Client.Core.Services;
using TradePulse.Client.WPF.Services;
using TradePulse.Client.WPF.ViewModels;

namespace TradePulse.Client.WPF.Views;

public partial class MainWindow : Window
{
    public MainWindow(MainViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;

        try
        {
            var mediaEngine = App.GetService<IWebMediaEngineService>();
            if (mediaEngine is WebView2MediaEngineService wv2Engine)
            {
                wv2Engine.AttachWebView2Host(VideoWebView);
            }
        }
        catch
        {
        }

        viewModel.LogoutRequested += (sender, e) =>
        {
            // Show login window and close main window
            var loginWindow = App.GetService<LoginWindow>();
            loginWindow.Show();
            this.Close();
        };
    }

    private void GroupCallItem_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is GroupCallSlotViewModel slot)
        {
            var viewModel = DataContext as MainViewModel;
            viewModel?.StartGroupCallFromGridCommand.Execute(slot);
        }
    }

    private void PttButton_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            if (vm.PttDownCommand.CanExecute(null))
            {
                vm.PttDownCommand.Execute(null);
            }
        }
    }

    private void PttButton_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            if (vm.PttUpCommand.CanExecute(null))
            {
                vm.PttUpCommand.Execute(null);
            }
        }
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

