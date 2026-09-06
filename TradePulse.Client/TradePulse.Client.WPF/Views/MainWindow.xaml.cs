using System.Windows;
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
                wv2Engine.AttachWebView2Host(ContactsPanelControl.VideoWebView);
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
}
