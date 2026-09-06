using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Microsoft.Web.WebView2.Wpf;
using TradePulse.Client.WPF.ViewModels;

namespace TradePulse.Client.WPF.Views.MainWindowParts;

public partial class ContactsPanel : Border
{
    public ContactsPanel()
    {
        InitializeComponent();
    }

    /// <summary>The WebView2 host used for in-call video, so MainWindow can attach the media engine to it.</summary>
    public WebView2 VideoWebView => VideoWebViewElement;

    private void PttButton_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is MainViewModel vm && vm.PttDownCommand.CanExecute(null))
        {
            vm.PttDownCommand.Execute(null);
        }
    }

    private void PttButton_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is MainViewModel vm && vm.PttUpCommand.CanExecute(null))
        {
            vm.PttUpCommand.Execute(null);
        }
    }
}
