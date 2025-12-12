using System.Windows;
using TradePulse.Client.WPF.ViewModels;

namespace TradePulse.Client.WPF.Views;

public partial class SettingsWindow : Window
{
    public SettingsWindow(SettingsViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
        
        // Subscribe to close request
        viewModel.RequestClose += () => this.Close();
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        this.Close();
    }
}

