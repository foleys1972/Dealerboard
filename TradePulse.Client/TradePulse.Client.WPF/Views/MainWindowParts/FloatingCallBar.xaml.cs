using System.Windows.Controls;
using System.Windows.Input;
using TradePulse.Client.WPF.ViewModels;

namespace TradePulse.Client.WPF.Views.MainWindowParts;

public partial class FloatingCallBar : Border
{
    public FloatingCallBar()
    {
        InitializeComponent();
    }

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
