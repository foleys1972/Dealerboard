using System.Windows;
using System.Windows.Input;
using TradePulse.Client.Core.Models;
using TradePulse.Client.WPF.ViewModels;

namespace TradePulse.Client.WPF.Views;

public partial class MainWindow : Window
{
    public MainWindow(MainViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;

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
        if (sender is FrameworkElement element && element.DataContext is Group group)
        {
            var viewModel = DataContext as MainViewModel;
            viewModel?.StartGroupCallFromGridCommand.Execute(group);
        }
    }
}

