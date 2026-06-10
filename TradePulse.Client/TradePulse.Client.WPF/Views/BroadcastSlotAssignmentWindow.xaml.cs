using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Collections.Generic;
using System.Windows;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.WPF.Views;

public partial class BroadcastSlotAssignmentWindow : Window
{
    private readonly ObservableCollection<IntercomAllowedGroup> _items;
    private readonly List<IntercomAllowedGroup> _all;

    public string? SelectedGroupId { get; private set; }

    public BroadcastSlotAssignmentWindow(IEnumerable<IntercomAllowedGroup> allowedBroadcasts, string title)
    {
        InitializeComponent();

        Title = title;

        _all = allowedBroadcasts?.ToList() ?? new List<IntercomAllowedGroup>();
        _items = new ObservableCollection<IntercomAllowedGroup>(_all);

        ItemsList.ItemsSource = _items;

        SearchTextBox.TextChanged += (_, _) => ApplyFilter();
        CancelButton.Click += (_, _) => { DialogResult = false; Close(); };
        ClearButton.Click += (_, _) => { SelectedGroupId = null; DialogResult = true; Close(); };
        AssignButton.Click += (_, _) => AssignSelected();

        ItemsList.MouseDoubleClick += (_, _) => AssignSelected();

        Loaded += (_, _) =>
        {
            SearchTextBox.Focus();
            if (_items.Count > 0)
            {
                ItemsList.SelectedIndex = 0;
            }
        };
    }

    private void ApplyFilter()
    {
        var q = (SearchTextBox.Text ?? string.Empty).Trim();
        _items.Clear();

        IEnumerable<IntercomAllowedGroup> filtered = _all;
        if (!string.IsNullOrWhiteSpace(q))
        {
            filtered = filtered.Where(i => (i.Name ?? string.Empty).Contains(q, StringComparison.OrdinalIgnoreCase));
        }

        foreach (var item in filtered)
        {
            _items.Add(item);
        }

        if (_items.Count > 0)
        {
            ItemsList.SelectedIndex = 0;
        }
    }

    private void AssignSelected()
    {
        if (ItemsList.SelectedItem is not IntercomAllowedGroup selected)
        {
            return;
        }

        SelectedGroupId = selected.Id;
        DialogResult = true;
        Close();
    }
}
