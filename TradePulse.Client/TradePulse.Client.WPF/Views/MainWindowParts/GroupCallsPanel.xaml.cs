using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using TradePulse.Client.WPF.ViewModels;

namespace TradePulse.Client.WPF.Views.MainWindowParts;

public partial class GroupCallsPanel : Border
{
    public GroupCallsPanel()
    {
        InitializeComponent();
    }

    private void GroupCallItem_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is GroupCallSlotViewModel slot)
        {
            var viewModel = DataContext as MainViewModel;
            viewModel?.StartGroupCallFromGridCommand.Execute(slot);
        }
    }
}
