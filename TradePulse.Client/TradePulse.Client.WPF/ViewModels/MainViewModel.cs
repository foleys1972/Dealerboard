using System;
using System.Collections.ObjectModel;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;
using TradePulse.Client.Core.Services;
using TradePulse.Client.WPF.Views;
using System.Windows;
using Interaction = Microsoft.VisualBasic.Interaction;
using System.Windows.Threading;
using System.IO;
using System.Text.Json;
using MaterialDesignThemes.Wpf;

namespace TradePulse.Client.WPF.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly ILogger<MainViewModel> _logger;
    private readonly IAuthService _authService;
    private readonly ICallService _callService;
    private readonly ISocketService _socketService;
    private readonly IWebMediaEngineService _webMediaEngineService;
    private readonly IUserService _userService;
    private readonly IGroupService _groupService;
    private readonly IConfigurationService _configService;
    private readonly IUserIntercomService _userIntercomService;
    private readonly IDirectContactService _directContactService;

    private DispatcherTimer? _presenceRefreshTimer;

    private const int MaxNotifications = 50;
    private const string NotificationsFolderName = "TradeCom";
    private const string NotificationsFileName = "notifications.json";

    private const string PersistedBroadcastSlotsSnapshotKey = "BroadcastSlotsSnapshot";
    private const string PersistedGroupCallSlotsSnapshotKey = "GroupCallSlotsSnapshot";

    private DateTimeOffset? _lastOutgoingCallStart;
    private DateTimeOffset? _lastIncomingCallStart;

    [ObservableProperty]
    private User? _currentUser;

    [ObservableProperty]
    private bool _isConnected;

    [ObservableProperty]
    private string _connectionStatus = "Disconnected";

    [ObservableProperty]
    private ObservableCollection<NotificationItemViewModel> _notifications = new();

    [ObservableProperty]
    private Call? _currentCall;

    public bool HasIncomingCall => CurrentCall != null && CurrentCall.State == CallState.Ringing;

    public bool IsCallActive => CurrentCall != null && CurrentCall.State != CallState.Ended && CurrentCall.State != CallState.Failed;

    public bool CanAddVideo => CurrentCall != null
                              && CurrentCall.Type == CallType.Direct
                              && !CurrentCall.EnableVideo
                              && CurrentCall.State != CallState.Ended
                              && CurrentCall.State != CallState.Failed;

    [ObservableProperty]
    private ObservableCollection<ContactViewModel> _contacts = new();

    private List<ContactViewModel> _contactsBacking = new();

    [ObservableProperty]
    private ContactViewModel? _selectedContact;

    [ObservableProperty]
    private ObservableCollection<Group> _groups = new();

    [ObservableProperty]
    private Group? _selectedGroup;

    [ObservableProperty]
    private ObservableCollection<ContactViewModel> _favorites = new();

    [ObservableProperty]
    private string _searchQuery = string.Empty;

    [ObservableProperty]
    private ObservableCollection<string> _companyOptions = new();

    [ObservableProperty]
    private string? _selectedCompany;

    [ObservableProperty]
    private ObservableCollection<string> _locationOptions = new();

    [ObservableProperty]
    private string? _selectedLocation;

    [ObservableProperty]
    private ObservableCollection<string> _tenantScopeOptions = new();

    [ObservableProperty]
    private string? _selectedTenantScope;

    [ObservableProperty]
    private string _callStatus = string.Empty;

    [ObservableProperty]
    private bool _isBroadcastMonitoring = false;

    [ObservableProperty]
    private bool _isDndEnabled;

    [ObservableProperty]
    private bool _isCallForwardEnabled;

    [ObservableProperty]
    private string _callForwardUsername = string.Empty;

    [ObservableProperty]
    private ObservableCollection<BroadcastViewModel> _broadcasts = new();

    [ObservableProperty]
    private ObservableCollection<GroupCallSlotViewModel> _groupCalls = new();

    [ObservableProperty]
    private ObservableCollection<DirectContactViewModel> _directContacts = new();

    private List<DirectContactViewModel> _directContactsBacking = new();

    [ObservableProperty]
    private string _callDuration = string.Empty;

    [ObservableProperty]
    private bool _isPttLatched;

    [ObservableProperty]
    private bool _isPttTransmitting;

    private System.Timers.Timer? _callDurationTimer;

    public int ActiveBroadcastCount => Broadcasts.Count(b => b.IsActive);

    public bool IsInCall => CurrentCall != null && CurrentCall.State != CallState.Ended && CurrentCall.State != CallState.Failed;

    private bool IsAdminRole(string? role) => role == "admin" || role == "platform_admin";

    private List<IntercomAllowedGroup> _allowedBroadcasts = new();

    // Option B: temporary auto-monitor while a broadcast is active.
    private readonly HashSet<string> _autoMonitoredBroadcasts = new(StringComparer.OrdinalIgnoreCase);

    private const string PersistedMonitoredBroadcastsKey = "MonitoredBroadcastGroupIds";
    private const string PersistedMonitoredBroadcastsInitializedKey = "MonitoredBroadcastGroupIdsInitialized";

    public bool ShowIntercomDisabledWarning => CurrentUser != null && !CurrentUser.IntercomEnabled && !IsAdminRole(CurrentUser.Role);

    public bool ShowContactsList => CurrentUser != null && (CurrentUser.IntercomEnabled || IsAdminRole(CurrentUser.Role));

    partial void OnCurrentCallChanged(Call? value)
    {
        OnPropertyChanged(nameof(IsInCall));
        OnPropertyChanged(nameof(HasIncomingCall));
        OnPropertyChanged(nameof(IsCallActive));
        OnPropertyChanged(nameof(CanAddVideo));

        if (value == null || value.State == CallState.Ended || value.State == CallState.Failed)
        {
            IsPttLatched = false;
            IsPttTransmitting = false;
        }

        if (value != null && value.State == CallState.Connected)
        {
            StartCallDurationTimer();
        }
        else
        {
            _callDurationTimer?.Stop();
            CallDuration = string.Empty;
        }

    }

    private string GetNotificationsPath()
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var dir = Path.Combine(root, NotificationsFolderName);
        return Path.Combine(dir, NotificationsFileName);
    }

    private void LoadNotifications()
    {
        try
        {
            var path = GetNotificationsPath();
            var dir = Path.GetDirectoryName(path);
            if (string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir))
            {
                return;
            }

            if (!File.Exists(path))
            {
                return;
            }

            var json = File.ReadAllText(path);
            if (string.IsNullOrWhiteSpace(json)) return;

            var items = JsonSerializer.Deserialize<List<PersistedNotification>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<PersistedNotification>();

            var normalized = items
                .Where(i => i != null)
                .OrderByDescending(i => i!.Timestamp)
                .Take(MaxNotifications)
                .Select(i => new NotificationItemViewModel
                {
                    Timestamp = i!.Timestamp,
                    IconKind = i.IconKind,
                    Title = i.Title ?? string.Empty,
                    Message = i.Message ?? string.Empty,
                })
                .ToList();

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                Notifications.Clear();
                foreach (var n in normalized)
                {
                    Notifications.Add(n);
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "LoadNotifications failed");
        }
    }

    [RelayCommand]
    private async Task BroadcastPttDownAsync(BroadcastViewModel? broadcast)
    {
        if (broadcast == null) return;
        if (!broadcast.IsConfigured || string.IsNullOrWhiteSpace(broadcast.Id)) return;

        if (broadcast.IsPttTransmitting)
        {
            return;
        }

        broadcast.IsPttTransmitting = true;

        try
        {
            await _socketService.EmitAsync("broadcast-ptt-start", new { groupId = broadcast.Id });
        }
        catch (Exception ex)
        {
            broadcast.IsPttTransmitting = false;
            _logger.LogError(ex, "Failed to emit broadcast-ptt-start (groupId={GroupId})", broadcast.Id);
            return;
        }

        try
        {
            await _callService.SetBroadcastTransmittingMediaAsync(broadcast.Id, true);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to start broadcast transmit media (groupId={GroupId})", broadcast.Id);
        }
    }

    [RelayCommand]
    private async Task BroadcastPttUpAsync(BroadcastViewModel? broadcast)
    {
        if (broadcast == null) return;
        if (!broadcast.IsConfigured || string.IsNullOrWhiteSpace(broadcast.Id)) return;

        // If latched, releasing the button should not stop transmit.
        if (broadcast.IsPttLatched)
        {
            return;
        }

        if (!broadcast.IsPttTransmitting)
        {
            return;
        }

        broadcast.IsPttTransmitting = false;

        try
        {
            await _socketService.EmitAsync("broadcast-ptt-stop", new { groupId = broadcast.Id });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to emit broadcast-ptt-stop (groupId={GroupId})", broadcast.Id);
        }

        try
        {
            await _callService.SetBroadcastTransmittingMediaAsync(broadcast.Id, false);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to stop broadcast transmit media (groupId={GroupId})", broadcast.Id);
        }
    }

    private void SaveNotifications()
    {
        try
        {
            var path = GetNotificationsPath();
            var dir = Path.GetDirectoryName(path);
            if (string.IsNullOrWhiteSpace(dir)) return;
            Directory.CreateDirectory(dir);

            var items = Notifications
                .Take(MaxNotifications)
                .Select(n => new PersistedNotification
                {
                    Timestamp = n.Timestamp,
                    IconKind = n.IconKind,
                    Title = n.Title,
                    Message = n.Message,
                })
                .ToList();

            var json = JsonSerializer.Serialize(items, new JsonSerializerOptions
            {
                WriteIndented = true
            });
            File.WriteAllText(path, json);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "SaveNotifications failed");
        }
    }

    private void AddNotification(PackIconKind icon, string title, string message)
    {
        try
        {
            var n = new NotificationItemViewModel
            {
                Timestamp = DateTimeOffset.UtcNow,
                IconKind = icon,
                Title = title ?? string.Empty,
                Message = message ?? string.Empty,
            };

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                Notifications.Insert(0, n);
                while (Notifications.Count > MaxNotifications)
                {
                    Notifications.RemoveAt(Notifications.Count - 1);
                }
            });

            SaveNotifications();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "AddNotification failed");
        }
    }

    private class PersistedNotification
    {
        public DateTimeOffset Timestamp { get; set; }
        public PackIconKind IconKind { get; set; }
        public string? Title { get; set; }
        public string? Message { get; set; }
    }

    private static string BuildSlotsSnapshot(IEnumerable<(int Index, string? Id)> slots)
    {
        try
        {
            return string.Join(
                "|",
                (slots ?? Array.Empty<(int Index, string? Id)>())
                    .OrderBy(s => s.Index)
                    .Select(s => $"{s.Index}:{(s.Id ?? string.Empty).Trim()}")
            );
        }
        catch
        {
            return string.Empty;
        }
    }

    private void DetectProfileSlotChanges(string snapshotKey, string newSnapshot, string title)
    {
        try
        {
            var prev = _configService.GetValue<string>(snapshotKey) ?? string.Empty;

            // First run: store baseline without notifying.
            if (string.IsNullOrWhiteSpace(prev))
            {
                _configService.SetValue(snapshotKey, newSnapshot);
                _configService.Save();
                return;
            }

            if (!string.Equals(prev, newSnapshot, StringComparison.Ordinal))
            {
                AddNotification(PackIconKind.AccountEdit, title, "Your profile button assignments have changed.");
                AddNotification(PackIconKind.LogoutVariant, "Logout required", "Logout and log back in to receive the changes.");

                _configService.SetValue(snapshotKey, newSnapshot);
                _configService.Save();
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "DetectProfileSlotChanges failed ({Key})", snapshotKey);
        }
    }

    private void OnBroadcastMonitorUpdated(object? sender, (string LineId, bool IsMonitoring, int? ListenerCount) e)
    {
        try
        {
            var lineId = (e.LineId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(lineId))
            {
                return;
            }

            var item = Broadcasts.FirstOrDefault(b => string.Equals(b.Id, lineId, StringComparison.OrdinalIgnoreCase));
            if (item == null)
            {
                return;
            }

            // Keep UI consistent with server ack.
            item.IsActive = e.IsMonitoring;
            if (e.ListenerCount.HasValue)
            {
                item.ListenerCount = e.ListenerCount.Value;
            }

            // Critical: ensure receive-only monitoring media is started/stopped when the server confirms the state.
            // This fixes the case where persisted monitor state is restored on login but audio doesn't flow until user toggles.
            try
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        if (!e.IsMonitoring)
                        {
                            await _callService.SetBroadcastMonitoringMediaAsync(lineId, false);
                            return;
                        }

                        // Start (and implicitly restart) receive-only monitoring for this broadcast.
                        // SetBroadcastMonitoringMediaAsync(true) already stops and restarts the RTP bridge
                        // to ensure it's scoped to the latest groupId.
                        await _callService.SetBroadcastMonitoringMediaAsync(lineId, true);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Failed to sync broadcast monitoring media on server monitor update (groupId={GroupId}, monitoring={Monitoring})", lineId, e.IsMonitoring);
                    }
                });
            }
            catch { }

            OnPropertyChanged(nameof(ActiveBroadcastCount));

            // Persist manual monitoring selections across sessions.
            try
            {
                PersistMonitoredBroadcasts();
            }
            catch { }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed handling BroadcastMonitorUpdated");
        }
    }

    private void OnBroadcastVoxChanged(object? sender, (string GroupId, bool IsActive) e)
    {
        try
        {
            var groupId = (e.GroupId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(groupId))
            {
                return;
            }

            var item = Broadcasts.FirstOrDefault(b => string.Equals(b.Id, groupId, StringComparison.OrdinalIgnoreCase));
            if (item == null)
            {
                return;
            }

            // VOX should only show while monitoring is active for this line.
            item.IsVoxActive = item.IsActive && e.IsActive;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed handling BroadcastVoxChanged");
        }
    }

    private HashSet<string> GetPersistedMonitoredBroadcasts()
    {
        try
        {
            var list = _configService.GetValue<List<string>>(PersistedMonitoredBroadcastsKey);
            return new HashSet<string>((list ?? new List<string>()).Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()), StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private bool HasPersistedMonitoredBroadcastsInitialized()
    {
        try
        {
            return _configService.GetValue<bool?>(PersistedMonitoredBroadcastsInitializedKey) == true;
        }
        catch
        {
            return false;
        }
    }

    private void PersistMonitoredBroadcasts()
    {
        // Only persist explicit user monitoring (IsActive) – not auto-monitor.
        var active = Broadcasts
            .Where(b => b.IsConfigured && !string.IsNullOrWhiteSpace(b.Id) && b.IsActive)
            .Select(b => b.Id)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        _configService.SetValue(PersistedMonitoredBroadcastsKey, active);
        _configService.SetValue(PersistedMonitoredBroadcastsInitializedKey, true);
        _configService.Save();
    }

    private async Task RestorePersistedBroadcastMonitorsAsync()
    {
        if (!_socketService.IsConnected)
        {
            return;
        }

        var persisted = GetPersistedMonitoredBroadcasts();
        if (persisted.Count == 0)
        {
            return;
        }

        foreach (var b in Broadcasts)
        {
            if (!b.IsConfigured || string.IsNullOrWhiteSpace(b.Id))
            {
                continue;
            }

            if (!persisted.Contains(b.Id))
            {
                continue;
            }

            try
            {
                try
                {
                    // Reflect desired state in UI immediately; media will be restarted on server ack.
                    b.IsActive = true;
                }
                catch { }

                await _socketService.EmitAsync("broadcast-monitor", new { groupId = b.Id, monitor = true });
                _logger.LogInformation("Restored persisted broadcast monitor: {LineId}", b.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to restore broadcast monitor for {LineId}", b.Id);
            }
        }
    }

    private async Task AutoStartAssignedBroadcastMonitoringAsync()
    {
        try
        {
            if (!_socketService.IsConnected)
            {
                return;
            }

            // Once the user has explicitly saved monitor preferences, do not auto-enable
            // broadcasts they have turned off (even if they are assigned).
            var prefsInitialized = HasPersistedMonitoredBroadcastsInitialized();
            var persisted = prefsInitialized ? GetPersistedMonitoredBroadcasts() : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var b in Broadcasts)
            {
                if (!b.IsConfigured || string.IsNullOrWhiteSpace(b.Id))
                {
                    continue;
                }

                if (prefsInitialized && !persisted.Contains(b.Id))
                {
                    // User explicitly does NOT want to monitor this broadcast.
                    try
                    {
                        if (b.IsActive)
                        {
                            b.IsActive = false;
                        }
                    }
                    catch { }

                    try
                    {
                        await _socketService.EmitAsync("broadcast-monitor", new { groupId = b.Id, monitor = false });
                    }
                    catch { }

                    try
                    {
                        await _callService.SetBroadcastMonitoringMediaAsync(b.Id, false);
                    }
                    catch { }

                    continue;
                }

                // Assigned broadcasts should receive audio immediately.
                // Treat this as monitoring on by default.
                try
                {
                    if (!b.IsActive)
                    {
                        Application.Current?.Dispatcher?.Invoke(() =>
                        {
                            if (!b.IsActive)
                            {
                                b.IsActive = true;
                            }
                        });
                    }
                }
                catch { }

                try
                {
                    await _socketService.EmitAsync("broadcast-monitor", new { groupId = b.Id, monitor = true });
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to enable broadcast-monitor for assigned broadcast: {LineId}", b.Id);
                }

                try
                {
                    await _callService.SetBroadcastMonitoringMediaAsync(b.Id, true);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to start receive-only media for assigned broadcast: {LineId}", b.Id);
                }
            }

            OnPropertyChanged(nameof(ActiveBroadcastCount));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed auto-starting assigned broadcast monitoring");
        }
    }

    private async void OnBroadcastActiveChanged(object? sender, (string LineId, bool IsActive) e)
    {
        try
        {
            var lineId = (e.LineId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(lineId))
            {
                return;
            }

            // Only auto-monitor broadcasts the user is assigned/allowed to see.
            var isAssigned = Broadcasts.Any(b => string.Equals(b.Id, lineId, StringComparison.OrdinalIgnoreCase));
            if (!isAssigned)
            {
                return;
            }

            // Respect persisted user preference: if the user explicitly turned monitoring off for this line,
            // do not auto-monitor it just because it became active.
            try
            {
                if (HasPersistedMonitoredBroadcastsInitialized())
                {
                    var persisted = GetPersistedMonitoredBroadcasts();
                    if (!persisted.Contains(lineId))
                    {
                        return;
                    }
                }
            }
            catch { }

            if (e.IsActive)
            {
                // If user already manually monitors it, don't interfere.
                var alreadyManual = Broadcasts.FirstOrDefault(b => string.Equals(b.Id, lineId, StringComparison.OrdinalIgnoreCase))?.IsActive == true;
                if (alreadyManual)
                {
                    return;
                }

                if (_autoMonitoredBroadcasts.Add(lineId))
                {
                    await _socketService.EmitAsync("broadcast-monitor", new { groupId = lineId, monitor = true });
                    _logger.LogInformation("Auto-monitor enabled for active broadcast: {LineId}", lineId);
                }
            }
            else
            {
                if (_autoMonitoredBroadcasts.Remove(lineId))
                {
                    await _socketService.EmitAsync("broadcast-monitor", new { groupId = lineId, monitor = false });
                    _logger.LogInformation("Auto-monitor disabled for ended broadcast: {LineId}", lineId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed handling BroadcastActiveChanged");
        }
    }

    [RelayCommand]
    private async void DeleteDirectContact(DirectContactViewModel? contact)
    {
        if (contact == null)
        {
            return;
        }

        try
        {
            var name = !string.IsNullOrWhiteSpace(contact.Name) ? contact.Name : contact.Id;
            var result = MessageBox.Show(
                $"Delete direct contact '{name}'?",
                "Confirm Delete",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);

            if (result != MessageBoxResult.Yes)
            {
                return;
            }

            var ok = await _directContactService.DeleteDirectContactAsync(contact.Id);
            if (!ok)
            {
                MessageBox.Show("Failed to delete direct contact. See logs for details.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            await LoadDirectContactsAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete direct contact");
            MessageBox.Show($"Failed to delete direct contact: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    partial void OnCurrentUserChanged(User? value)
    {
        OnPropertyChanged(nameof(ShowIntercomDisabledWarning));
        OnPropertyChanged(nameof(ShowContactsList));
    }

    public event EventHandler? LogoutRequested;

    public MainViewModel(
        ILogger<MainViewModel> logger,
        IAuthService authService,
        ICallService callService,
        ISocketService socketService,
        IWebMediaEngineService webMediaEngineService,
        IUserService userService,
        IGroupService groupService,
        IUserIntercomService userIntercomService,
        IConfigurationService configService,
        IDirectContactService directContactService)
    {
        _logger = logger;
        _authService = authService;
        _callService = callService;
        _socketService = socketService;
        _webMediaEngineService = webMediaEngineService;
        _userService = userService;
        _groupService = groupService;
        _userIntercomService = userIntercomService;
        _configService = configService;
        _directContactService = directContactService;

        CurrentUser = _authService.CurrentUser;
        IsConnected = _socketService.IsConnected;
        ConnectionStatus = IsConnected ? "Connected" : "Disconnected";

        // Subscribe to events
        _authService.UserAuthenticated += OnUserAuthenticated;
        _authService.UserLoggedOut += OnUserLoggedOut;
        _socketService.ConnectionStateChanged += OnConnectionStateChanged;
        _socketService.UserStatusChanged += OnUserStatusChanged;
        _socketService.BroadcastActiveChanged += OnBroadcastActiveChanged;
        _socketService.BroadcastMonitorUpdated += OnBroadcastMonitorUpdated;
        _callService.BroadcastVoxChanged += OnBroadcastVoxChanged;
        _callService.CallStarted += OnCallStarted;
        _callService.CallStateChanged += OnCallStateChanged;
        _callService.CallEnded += OnCallEnded;

        try
        {
            LoadNotifications();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to load persisted notifications");
        }

        // Check if user is already authenticated (e.g., when MainWindow is shown after login)
        // This handles the case where UserAuthenticated event fired before MainViewModel was created
        if (_authService.IsAuthenticated && _authService.CurrentUser != null)
        {
            _logger.LogInformation("MainViewModel initialized with already-authenticated user: {Username}", _authService.CurrentUser.Username);
            // Manually call OnUserAuthenticated to set up the UI
            // Note: OnUserAuthenticated is async void, so we just call it directly
            OnUserAuthenticated(_authService, _authService.CurrentUser);
        }

        // Don't load contacts on initialization - wait for authentication
        // Contacts will be loaded after successful login in OnUserAuthenticated
    }

    private async Task LoadContactsAsync()
    {
        try
        {
            _logger.LogInformation("Loading contacts...");
            
            // Check if current user has intercom enabled
            if (CurrentUser != null && !CurrentUser.IntercomEnabled && !IsAdminRole(CurrentUser.Role))
            {
                _logger.LogWarning("Current user does not have intercom enabled. Contacts will not be loaded.");
                Contacts.Clear();
                return;
            }
            
            var users = await _userService.GetContactsAsync();

            _contactsBacking = (users ?? new List<User>())
                .Select(user => new ContactViewModel
                {
                    Id = user.Id,
                    Username = user.Username,
                    Name = user.DisplayName ?? user.Username,
                    Status = user.IsOnline
                        ? ((user.Status ?? "available").Trim())
                        : "offline",
                    Extension = user.Extension,
                    SipUri = user.SipUri,
                    Department = user.Department,
                    Company = !string.IsNullOrWhiteSpace(user.CompanyName) ? user.CompanyName : user.TenantId,
                    Location = user.SiteId
                })
                .ToList();

            // Populate Company/Location options from fields we actually have.
            Application.Current?.Dispatcher?.Invoke(() =>
            {
                var companies = _contactsBacking
                    .Select(c => c.Company)
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                var locations = _contactsBacking
                    .Select(c => c.Location)
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                CompanyOptions.Clear();
                CompanyOptions.Add("All");
                foreach (var c in companies)
                {
                    CompanyOptions.Add(c!);
                }

                LocationOptions.Clear();
                LocationOptions.Add("All");
                foreach (var l in locations)
                {
                    LocationOptions.Add(l!);
                }

                if (string.IsNullOrWhiteSpace(SelectedCompany))
                {
                    SelectedCompany = "All";
                }
                else if (!CompanyOptions.Contains(SelectedCompany))
                {
                    SelectedCompany = "All";
                }

                if (string.IsNullOrWhiteSpace(SelectedLocation))
                {
                    SelectedLocation = "All";
                }
                else if (!LocationOptions.Contains(SelectedLocation))
                {
                    SelectedLocation = "All";
                }
            });

            ApplyContactsFilter();

            _logger.LogInformation("Loaded {Count} contacts", Contacts.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load contacts");
        }
    }

    private void OnUserStatusChanged(object? sender, User user)
    {
        try
        {
            var uid = (user.Id ?? string.Empty).Trim();
            var uname = (user.Username ?? string.Empty).Trim();
            var status = (user.Status ?? string.Empty).Trim();

            // Presence payloads sometimes omit username. Infer it from the directory contacts list.
            // This is important because DirectContacts are often keyed by username / SIP URI username.
            string inferredUsername = uname;
            if (string.IsNullOrWhiteSpace(inferredUsername) && !string.IsNullOrWhiteSpace(uid))
            {
                try
                {
                    var dir = Contacts.FirstOrDefault(c => string.Equals(c.Id, uid, StringComparison.OrdinalIgnoreCase))
                              ?? _contactsBacking.FirstOrDefault(c => string.Equals(c.Id, uid, StringComparison.OrdinalIgnoreCase));
                    inferredUsername = (dir?.Username ?? string.Empty).Trim();
                    if (string.IsNullOrWhiteSpace(inferredUsername))
                    {
                        inferredUsername = (dir?.Name ?? string.Empty).Trim();
                    }
                }
                catch { }
            }

            string presence;
            if (!user.IsOnline)
            {
                presence = "offline";
            }
            else
            {
                var s = status.ToLowerInvariant();
                presence = s switch
                {
                    "busy" => "busy",
                    "dnd" => "dnd",
                    "oncall" => "oncall",
                    "in-call" => "oncall",
                    "incall" => "oncall",
                    _ => "available"
                };
            }

            // Update contact status if in list (use normalized presence string)
            var contact = Contacts.FirstOrDefault(c => string.Equals(c.Id, uid, StringComparison.OrdinalIgnoreCase));
            if (contact != null)
            {
                contact.Status = presence;
            }

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                foreach (var dc in DirectContacts)
                {
                    if (dc == null) continue;

                    var dcUserId = (dc.ContactUserId ?? string.Empty).Trim();
                    var dcFromUri = (TryExtractUserIdFromUri(dc.Uri) ?? string.Empty).Trim();
                    var match = (!string.IsNullOrWhiteSpace(uid) && string.Equals(dcUserId, uid, StringComparison.OrdinalIgnoreCase))
                                || (!string.IsNullOrWhiteSpace(inferredUsername) && string.Equals(dcUserId, inferredUsername, StringComparison.OrdinalIgnoreCase))
                                || (!string.IsNullOrWhiteSpace(inferredUsername) && string.Equals(dcFromUri, inferredUsername, StringComparison.OrdinalIgnoreCase))
                                || (!string.IsNullOrWhiteSpace(uid) && string.Equals(dcFromUri, uid, StringComparison.OrdinalIgnoreCase));

                    if (match)
                    {
                        dc.Status = presence;
                    }
                }

                foreach (var dc in _directContactsBacking)
                {
                    if (dc == null) continue;

                    var dcUserId = (dc.ContactUserId ?? string.Empty).Trim();
                    var dcFromUri = (TryExtractUserIdFromUri(dc.Uri) ?? string.Empty).Trim();
                    var match = (!string.IsNullOrWhiteSpace(uid) && string.Equals(dcUserId, uid, StringComparison.OrdinalIgnoreCase))
                                || (!string.IsNullOrWhiteSpace(inferredUsername) && string.Equals(dcUserId, inferredUsername, StringComparison.OrdinalIgnoreCase))
                                || (!string.IsNullOrWhiteSpace(inferredUsername) && string.Equals(dcFromUri, inferredUsername, StringComparison.OrdinalIgnoreCase))
                                || (!string.IsNullOrWhiteSpace(uid) && string.Equals(dcFromUri, uid, StringComparison.OrdinalIgnoreCase));

                    if (match)
                    {
                        dc.Status = presence;
                    }
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to apply presence update to direct contacts");
        }
        
        // Update current user status if it's the current user
        if (CurrentUser != null && CurrentUser.Id == user.Id)
        {
            CurrentUser.Status = user.Status ?? "offline";
            CurrentUser.IsOnline = user.IsOnline;
            IsConnected = user.IsOnline;
            ConnectionStatus = user.IsOnline ? "Connected" : "Disconnected";
            OnPropertyChanged(nameof(ConnectionStatus));
        }
    }

    [RelayCommand]
    private async Task ToggleDndAsync()
    {
        try
        {
            IsDndEnabled = !IsDndEnabled;
            await _socketService.EmitAsync("set-dnd", new { enabled = IsDndEnabled });

            try
            {
                if (CurrentUser != null)
                {
                    CurrentUser.Status = IsDndEnabled ? "dnd" : "available";
                    CurrentUser.IsOnline = true;
                    OnPropertyChanged(nameof(CurrentUser));
                }
            }
            catch { }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle DND");
            MessageBox.Show($"Failed to toggle DND: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task ConfigureCallForwardAsync()
    {
        try
        {
            var input = Interaction.InputBox(
                "Enter username to forward ALL direct calls to (leave blank to disable):",
                "Call Forward",
                CallForwardUsername ?? string.Empty);

            var uname = (input ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(uname))
            {
                IsCallForwardEnabled = false;
                CallForwardUsername = string.Empty;
                await _socketService.EmitAsync("set-call-forward", new { enabled = false, forwardToUsername = (string?)null });
                return;
            }

            IsCallForwardEnabled = true;
            CallForwardUsername = uname;
            await _socketService.EmitAsync("set-call-forward", new { enabled = true, forwardToUsername = uname });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to configure call forward");
            MessageBox.Show($"Failed to configure call forward: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task StartConferenceAsync()
    {
        try
        {
            var selected = (SelectedContact?.Id ?? string.Empty).Trim();
            var input = Interaction.InputBox(
                "Enter usernames for conference (comma-separated). Optionally select a contact first.",
                "Start Conference",
                string.Empty);

            var fromInput = (input ?? string.Empty)
                .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList();

            if (!string.IsNullOrWhiteSpace(selected))
            {
                fromInput.Add(selected);
            }

            var targets = fromInput
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (targets.Count == 0)
            {
                return;
            }

            await _callService.StartConferenceAsync(targets);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start conference");
            MessageBox.Show($"Failed to start conference: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async void Call()
    {
        if (SelectedContact == null)
        {
            return;
        }

        try
        {
            await _callService.StartCallAsync(SelectedContact.Id, CallType.Direct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start call");
        }
    }

    [RelayCommand]
    private async void StartCallForContact(ContactViewModel? contact)
    {
        if (contact == null)
        {
            return;
        }

        try
        {
            SelectedContact = contact;
            await _callService.StartCallAsync(contact.Id, CallType.Direct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start call for contact: {ContactId}", contact.Id);
        }
    }

    [RelayCommand]
    private async void StartVideoCallForContact(ContactViewModel? contact)
    {
        if (contact == null)
        {
            return;
        }

        try
        {
            SelectedContact = contact;
            await _callService.StartCallAsync(contact.Id, CallType.Direct, enableVideo: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start video call for contact: {ContactId}", contact.Id);
        }
    }

    [RelayCommand]
    private async void StartGroupCall()
    {
        if (SelectedGroup == null)
        {
            return;
        }

        try
        {
            await _callService.StartGroupCallAsync(SelectedGroup.Id, CallType.Conference);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start group call");
        }
    }

    [RelayCommand]
    private async void StartBroadcast()
    {
        if (SelectedGroup == null)
        {
            return;
        }

        try
        {
            await _callService.StartBroadcastAsync(SelectedGroup.Id, IsBroadcastMonitoring);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start broadcast");
        }
    }

    [RelayCommand]
    private async void ToggleBroadcastMonitor()
    {
        if (CurrentCall == null || CurrentCall.Type != CallType.Broadcast)
        {
            return;
        }

        try
        {
            await _callService.ToggleBroadcastMonitorAsync(CurrentCall.Id, !IsBroadcastMonitoring);
            IsBroadcastMonitoring = !IsBroadcastMonitoring;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle broadcast monitor");
        }
    }

    private async void OnUserAuthenticated(object? sender, User user)
    {
        try
        {
            _logger.LogInformation("=== OnUserAuthenticated called for user: {Username} ===", user?.Username ?? "NULL");
            
            if (user == null)
            {
                _logger.LogError("OnUserAuthenticated received null user!");
                return;
            }
            
            CurrentUser = user;
            
            // Log user configuration - use explicit null check since IntercomEnabled defaults to true
            var intercomStatus = user.IntercomEnabled ? "ENABLED" : "DISABLED";
            _logger.LogInformation("User authenticated: {Username}, IntercomEnabled: {IntercomEnabled} ({Status}), DealerboardEnabled: {DealerboardEnabled}, Role: {Role}", 
                user.Username, user.IntercomEnabled, intercomStatus, user.DealerboardEnabled, user.Role);
        
        // Update computed properties
        OnPropertyChanged(nameof(ShowIntercomDisabledWarning));
        OnPropertyChanged(nameof(ShowContactsList));
        OnPropertyChanged(nameof(CurrentUser));
        
        // Check if user has intercom enabled - admins can always access
        if (!user.IntercomEnabled && user.Role != "admin")
        {
            _logger.LogWarning("User {Username} does not have intercom enabled. Connection may be limited.", user.Username);
        }
        else if (user.IntercomEnabled)
        {
            _logger.LogInformation("User {Username} has intercom enabled - contacts will be loaded", user.Username);
        }
        
        // Update connection status immediately - we're authenticated via HTTP
        var isAuthenticated = _authService.IsAuthenticated;
        _logger.LogInformation("AuthService.IsAuthenticated: {IsAuthenticated}, AuthToken available: {HasToken}", 
            isAuthenticated, !string.IsNullOrEmpty(_authService.AuthToken));

        Application.Current?.Dispatcher?.Invoke(() =>
        {
            IsConnected = isAuthenticated;
            ConnectionStatus = isAuthenticated ? "Connected" : "Disconnected";

            if (CurrentUser != null)
            {
                CurrentUser.Status = isAuthenticated ? "online" : "offline";
                CurrentUser.IsOnline = isAuthenticated;
            }

            OnPropertyChanged(nameof(ConnectionStatus));
            OnPropertyChanged(nameof(IsConnected));
            OnPropertyChanged(nameof(CurrentUser));
        });

        _logger.LogInformation("Connection status updated: {ConnectionStatus}, IsConnected: {IsConnected}, User.Status: {UserStatus}", 
            ConnectionStatus, IsConnected, CurrentUser?.Status ?? "null");
        
        // Wait a moment for socket to connect (optional) and ensure auth token is fully available
        await Task.Delay(500);
        
        // Check socket status (optional - HTTP auth is primary) and update if needed
        var socketConnected = _socketService.IsConnected;
        if (!socketConnected && isAuthenticated)
        {
            _logger.LogWarning("Socket.IO connection failed, but HTTP authentication succeeded. App will function in limited mode.");
            Application.Current?.Dispatcher?.Invoke(() =>
            {
                ConnectionStatus = "Connected (Socket.IO unavailable)";
                OnPropertyChanged(nameof(ConnectionStatus));
            });
        }
        
        // Reload contacts after authentication - ensure token is available first
        _logger.LogInformation("Loading contacts after authentication - AuthToken available: {HasToken}, Token length: {TokenLength}", 
            !string.IsNullOrEmpty(_authService.AuthToken), _authService.AuthToken?.Length ?? 0);

        TenantScopeOptions = new ObservableCollection<string>(new[] { "All", "Internal", "Public" });
        SelectedTenantScope = "All";
        await LoadContactsAsync();
        
        // Load user groups
        await LoadGroupsAsync();
        
        // Load broadcasts, group calls, and direct contacts
        await LoadBroadcastsAsync();
        await LoadGroupCallsAsync();
        await LoadDirectContactsAsync();

        // Restore persisted broadcast monitoring after broadcasts are loaded.
        await RestorePersistedBroadcastMonitorsAsync();

        // Pre-warm the WebView2 mediasoup-client media engine so the first direct call doesn't
        // pay the WebView2 initialization + navigation cost (which currently takes ~10s).
        _ = Task.Run(async () =>
        {
            try
            {
                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(20));
                await _webMediaEngineService.EnsureInitializedAsync(cts.Token);
                _logger.LogInformation("WebView2 media engine pre-warm completed");
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("WebView2 media engine pre-warm canceled");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "WebView2 media engine pre-warm failed");
            }
        });
        
        _logger.LogInformation("=== OnUserAuthenticated completed for user: {Username}, IsConnected: {IsConnected}, ConnectionStatus: {ConnectionStatus} ===", 
            user.Username, IsConnected, ConnectionStatus);

        try
        {
            if (_presenceRefreshTimer == null)
            {
                _presenceRefreshTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromMinutes(1)
                };

                _presenceRefreshTimer.Tick += async (_, __) =>
                {
                    try
                    {
                        await RefreshPresenceAsync();
                    }
                    catch { }
                };
            }

            if (!_presenceRefreshTimer.IsEnabled)
            {
                _presenceRefreshTimer.Start();
            }
        }
        catch { }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception in OnUserAuthenticated: {Message}", ex.Message);
        }
    }

    private async Task RefreshPresenceAsync()
    {
        try
        {
            await LoadContactsAsync();
            await LoadDirectContactsAsync();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Presence refresh failed");
        }
    }

    private async Task LoadGroupsAsync()
    {
        try
        {
            _logger.LogInformation("Loading user groups...");
            
            var groups = await _groupService.GetUserGroupsAsync();
            
            Groups.Clear();
            foreach (var group in groups)
            {
                Groups.Add(group);
            }
            
            _logger.LogInformation("Loaded {Count} groups", Groups.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load groups");
        }
    }

    private void OnUserLoggedOut(object? sender, EventArgs e)
    {
        CurrentUser = null;
    }

    private void OnConnectionStateChanged(object? sender, bool isConnected)
    {
        _logger.LogInformation("OnConnectionStateChanged (Socket.IO): {IsConnected}", isConnected);
        
        // Check if we're authenticated via HTTP first - this is the primary indicator
        var isAuthenticated = _authService.IsAuthenticated;
        
        Application.Current?.Dispatcher?.Invoke(() =>
        {
            // Connection indicator should reflect Socket.IO connectivity.
            // HTTP auth can be valid while Socket.IO is down; reflect that in ConnectionStatus.
            IsConnected = isAuthenticated && isConnected;

            if (!isAuthenticated)
            {
                ConnectionStatus = "Disconnected";
            }
            else if (isConnected)
            {
                ConnectionStatus = "Connected";
            }
            else
            {
                ConnectionStatus = "Connected (Socket.IO unavailable)";
                _logger.LogInformation("Socket.IO connection lost, but HTTP authentication is active. App will continue with HTTP API.");
            }

            // Update current user status if available
            if (CurrentUser != null)
            {
                CurrentUser.Status = IsConnected ? "online" : "offline";
                CurrentUser.IsOnline = IsConnected;
            }

            OnPropertyChanged(nameof(ConnectionStatus));
            OnPropertyChanged(nameof(IsConnected));
        });

        _logger.LogInformation("Connection status updated in UI: {ConnectionStatus}, IsConnected: {IsConnected}", ConnectionStatus, IsConnected);

        // If Socket.IO connected AFTER broadcasts were loaded, we need to auto-start monitoring now.
        if (isConnected && _authService.IsAuthenticated)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await AutoStartAssignedBroadcastMonitoringAsync();
                    await RestorePersistedBroadcastMonitorsAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Post-connect broadcast monitor sync failed");
                }
            });
        }
    }

    private void OnCallStarted(object? sender, Call call)
    {
        Application.Current?.Dispatcher?.Invoke(() =>
        {
            CurrentCall = call;
            if (call.State == CallState.Ringing)
            {
                _lastIncomingCallStart = DateTimeOffset.UtcNow;
                CallStatus = $"Incoming call from {call.CallerName ?? call.CallerId ?? "Unknown"}";
                AddNotification(PackIconKind.PhoneIncoming, "Call received", $"From {call.CallerName ?? call.CallerId ?? "Unknown"}");
            }
            else
            {
                _lastOutgoingCallStart = DateTimeOffset.UtcNow;
                CallStatus = $"Calling {call.TargetName ?? call.TargetId}...";
                AddNotification(PackIconKind.PhoneOutgoing, "Call made", $"To {call.TargetName ?? call.TargetId ?? "Unknown"}");
            }
            OnPropertyChanged(nameof(IsInCall));
            OnPropertyChanged(nameof(HasIncomingCall));
            OnPropertyChanged(nameof(IsCallActive));
            OnPropertyChanged(nameof(CanAddVideo));
        });
    }

    [RelayCommand]
    private async Task AddVideoAsync()
    {
        if (!CanAddVideo || CurrentCall == null)
        {
            return;
        }

        try
        {
            var result = MessageBox.Show(
                "Switch to video call?",
                "Enable Video",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes)
            {
                return;
            }

            // Upgrade in-place: same callId, no new call.
            // Server will broadcast webrtc-setup-required to renegotiate media.
            await _socketService.EmitAsync("instant-enable-video", new { callId = CurrentCall.Id, enableVideo = true });

            // Optimistically update UI (server will also broadcast instant-call-active with enableVideo).
            CurrentCall.EnableVideo = true;
            OnPropertyChanged(nameof(CurrentCall));
            OnPropertyChanged(nameof(CanAddVideo));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add video to call");
            MessageBox.Show($"Failed to enable video: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void OnCallStateChanged(object? sender, Call call)
    {
        Application.Current?.Dispatcher?.Invoke(() =>
        {
            if (call == null)
            {
                return;
            }

            CurrentCall = call;
            OnPropertyChanged(nameof(CurrentCall));

            var currentUserId = CurrentUser?.Id ?? CurrentUser?.Username;
            var isOutgoing = !string.IsNullOrWhiteSpace(currentUserId)
                && !string.IsNullOrWhiteSpace(call.CallerId)
                && string.Equals(call.CallerId, currentUserId, StringComparison.OrdinalIgnoreCase);

            switch (call.State)
            {
                case CallState.Ringing:
                    CallStatus = $"Incoming call from {call.CallerName ?? call.CallerId ?? "Unknown"}";
                    break;
                case CallState.Connecting:
                    CallStatus = isOutgoing
                        ? $"Calling {call.TargetName ?? call.TargetId}..."
                        : $"Connecting to {call.CallerName ?? call.CallerId ?? "Unknown"}";
                    break;
                case CallState.Connected:
                    CallStatus = isOutgoing
                        ? $"Connected to {call.TargetName ?? call.TargetId}"
                        : $"Connected to {call.CallerName ?? call.CallerId ?? "Unknown"}";
                    break;
                case CallState.Ended:
                    CallStatus = "Call ended";
                    CurrentCall = null;
                    break;
            }

            OnPropertyChanged(nameof(IsInCall));
            OnPropertyChanged(nameof(HasIncomingCall));
            OnPropertyChanged(nameof(IsCallActive));
            OnPropertyChanged(nameof(CanAddVideo));
        });
    }

    private void OnCallEnded(object? sender, string callId)
    {
        Application.Current?.Dispatcher?.Invoke(() =>
        {
            try
            {
                // If we were ringing for an incoming call and ended quickly, treat as missed.
                if (_lastIncomingCallStart.HasValue && (DateTimeOffset.UtcNow - _lastIncomingCallStart.Value).TotalSeconds <= 15)
                {
                    AddNotification(PackIconKind.PhoneMissed, "Missed call", "You missed a call");
                }
            }
            catch { }
            finally
            {
                _lastIncomingCallStart = null;
                _lastOutgoingCallStart = null;
            }

            CurrentCall = null;
            CallStatus = string.Empty;
            CallDuration = string.Empty;
            _callDurationTimer?.Stop();

            IsPttLatched = false;
            IsPttTransmitting = false;

            OnPropertyChanged(nameof(IsInCall));
            OnPropertyChanged(nameof(HasIncomingCall));
            OnPropertyChanged(nameof(IsCallActive));
        });
    }

    [RelayCommand]
    private async Task PttDownAsync()
    {
        if (CurrentCall == null)
        {
            return;
        }

        if (IsPttTransmitting)
        {
            return;
        }

        try
        {
            await _socketService.EmitAsync("ptt-start", new { callId = CurrentCall.Id });
            IsPttTransmitting = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start PTT");
        }
    }

    [RelayCommand]
    private async Task PttUpAsync()
    {
        if (CurrentCall == null)
        {
            return;
        }

        if (IsPttLatched)
        {
            return;
        }

        if (!IsPttTransmitting)
        {
            return;
        }

        try
        {
            await _socketService.EmitAsync("ptt-stop", new { callId = CurrentCall.Id });
            IsPttTransmitting = false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to stop PTT");
        }
    }

    [RelayCommand]
    private async Task ToggleLatchAsync()
    {
        if (CurrentCall == null)
        {
            return;
        }

        try
        {
            if (!IsPttLatched)
            {
                IsPttLatched = true;
                await PttDownAsync();
            }
            else
            {
                IsPttLatched = false;
                await _socketService.EmitAsync("ptt-stop", new { callId = CurrentCall.Id });
                IsPttTransmitting = false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle latch");
        }
    }

    [RelayCommand]
    private async void AnswerIncomingCall()
    {
        if (CurrentCall == null || CurrentCall.State != CallState.Ringing)
        {
            return;
        }

        try
        {
            await _callService.AnswerCallAsync(CurrentCall.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to answer incoming call");
        }
    }

    [RelayCommand]
    private async void RejectIncomingCall()
    {
        if (CurrentCall == null || CurrentCall.State != CallState.Ringing)
        {
            return;
        }

        try
        {
            await _socketService.EmitAsync("instant-reject", new { callId = CurrentCall.Id, reason = "user-reject" });
            CurrentCall.State = CallState.Ended;
            OnPropertyChanged(nameof(CurrentCall));
            OnPropertyChanged(nameof(HasIncomingCall));
            OnPropertyChanged(nameof(IsCallActive));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reject incoming call");
        }
    }

    [RelayCommand]
    private async void ToggleFavorite(ContactViewModel? contact)
    {
        var targetContact = contact ?? SelectedContact;
        if (targetContact == null)
        {
            return;
        }

        try
        {
            // TODO: Implement favorite API call when backend is ready
            targetContact.IsFavorite = !targetContact.IsFavorite;
            
            // Update favorites collection
            if (targetContact.IsFavorite && !Favorites.Any(f => f.Id == targetContact.Id))
            {
                Favorites.Add(targetContact);
            }
            else if (!targetContact.IsFavorite)
            {
                var favoriteToRemove = Favorites.FirstOrDefault(f => f.Id == targetContact.Id);
                if (favoriteToRemove != null)
                {
                    Favorites.Remove(favoriteToRemove);
                }
            }
            
            _logger.LogInformation("Toggled favorite for contact: {ContactId}, IsFavorite: {IsFavorite}", 
                targetContact.Id, targetContact.IsFavorite);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle favorite");
        }
    }

    [RelayCommand]
    private async void Hangup()
    {
        if (CurrentCall == null)
        {
            return;
        }

        try
        {
            await _callService.HangupCallAsync(CurrentCall.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to hangup call");
        }
    }

    [RelayCommand]
    private async void Mute()
    {
        if (CurrentCall == null)
        {
            return;
        }

        try
        {
            await _callService.MuteCallAsync(CurrentCall.Id, !CurrentCall.IsMuted);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to mute call");
        }
    }

    [RelayCommand]
    private void Settings()
    {
        try
        {
            var settingsWindow = App.GetService<SettingsWindow>();
            
            settingsWindow.WindowStartupLocation = System.Windows.WindowStartupLocation.CenterScreen;
            
            settingsWindow.ShowDialog();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to open settings window");
            System.Windows.MessageBox.Show(
                $"Failed to open settings: {ex.Message}",
                "Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async void Logout()
    {
        try
        {
            await _authService.LogoutAsync();
            LogoutRequested?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to logout");
        }
    }

    [RelayCommand]
    private async Task ExitAsync()
    {
        try
        {
            _logger.LogInformation("Exit requested - performing best-effort cleanup");

            try
            {
                var logoutTask = _authService.LogoutAsync();
                await Task.WhenAny(logoutTask, Task.Delay(TimeSpan.FromSeconds(2)));
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "LogoutAsync failed during exit");
            }

            try
            {
                if (CurrentCall != null && !string.IsNullOrWhiteSpace(CurrentCall.Id) && CurrentCall.State != CallState.Ended)
                {
                    await _callService.HangupCallAsync(CurrentCall.Id);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to hang up call during exit");
            }

            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await _webMediaEngineService.StopAllAsync(cts.Token);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to stop WebView2 media engine during exit");
            }

            try
            {
                await _socketService.DisconnectAsync();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to disconnect socket during exit");
            }
        }
        finally
        {
            try
            {
                Application.Current.Shutdown();
            }
            catch
            {
                Environment.Exit(0);
            }
        }
    }

    [RelayCommand]
    private async Task RetrySocketConnectionAsync()
    {
        try
        {
            _logger.LogInformation("Manual Socket.IO connection retry requested");
            
            if (_authService.IsAuthenticated && !string.IsNullOrEmpty(_authService.AuthToken))
            {
                var serverUrl = _configService.ServerUrl;
                await _socketService.ConnectAsync(serverUrl, _authService.AuthToken);
                
                if (_authService.CurrentUser != null)
                {
                    await _socketService.AuthenticateAsync(
                        _authService.CurrentUser.Id,
                        _authService.CurrentUser.Username,
                        _authService.AuthToken);
                }
                
                _logger.LogInformation("Manual Socket.IO connection retry completed");
            }
            else
            {
                _logger.LogWarning("Cannot retry Socket.IO connection - not authenticated");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retry Socket.IO connection");
            System.Windows.MessageBox.Show(
                $"Failed to connect Socket.IO: {ex.Message}\n\nCheck the logs for more details.",
                "Connection Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Warning
            );
        }
    }

    private async Task LoadBroadcastsAsync()
    {
        try
        {
            _logger.LogInformation("Loading intercom broadcast line slots...");

            var config = await _userIntercomService.GetUserIntercomConfigAsync();
            _allowedBroadcasts = config?.AllowedBroadcastGroups ?? new List<IntercomAllowedGroup>();

            var slots = await _userIntercomService.GetBroadcastLineSlotsAsync();

            try
            {
                var snap = BuildSlotsSnapshot((slots ?? new List<IntercomBroadcastLineSlot>()).Select(s => (s.Index, s.GroupId)));
                DetectProfileSlotChanges(PersistedBroadcastSlotsSnapshotKey, snap, "Broadcast buttons updated");
            }
            catch { }

            Broadcasts.Clear();

            var groupNameLookup = Groups
                .Where(g => !string.IsNullOrWhiteSpace(g.Id))
                .GroupBy(g => g.Id, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First().Name, StringComparer.OrdinalIgnoreCase);

            var allowedNameLookup = (_allowedBroadcasts ?? new List<IntercomAllowedGroup>())
                .Where(a => !string.IsNullOrWhiteSpace(a.Id))
                .GroupBy(a => a.Id!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First().Name ?? string.Empty, StringComparer.OrdinalIgnoreCase);

            // Always render 8 slots.
            for (var i = 1; i <= 8; i++)
            {
                var slot = slots.FirstOrDefault(s => s.Index == i);
                var groupId = slot?.GroupId;
                var label = slot?.Label;

                string name;
                if (!string.IsNullOrWhiteSpace(label) && !string.Equals(label, groupId, StringComparison.OrdinalIgnoreCase))
                {
                    name = label!;
                }
                else if (!string.IsNullOrWhiteSpace(groupId) && groupNameLookup.TryGetValue(groupId!, out var groupName))
                {
                    name = groupName;
                }
                else if (!string.IsNullOrWhiteSpace(groupId) && allowedNameLookup.TryGetValue(groupId!, out var allowedName) && !string.IsNullOrWhiteSpace(allowedName))
                {
                    name = allowedName;
                }
                else
                {
                    name = !string.IsNullOrWhiteSpace(groupId) ? groupId! : $"Broadcast Line {i}";
                }

                Broadcasts.Add(new BroadcastViewModel
                {
                    SlotIndex = i,
                    Id = groupId ?? string.Empty,
                    Name = name,
                    IsActive = false,
                    ListenerCount = 0,
                    IsConfigured = !string.IsNullOrWhiteSpace(groupId)
                });
            }

            _logger.LogInformation("Loaded {Count} broadcast slots", Broadcasts.Count);
            OnPropertyChanged(nameof(ActiveBroadcastCount));

            // Broadcasts should be receive-only by default as soon as they are assigned.
            await AutoStartAssignedBroadcastMonitoringAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load broadcasts");
        }
    }

    [RelayCommand]
    private async void ConfigureBroadcastSlot(BroadcastViewModel? broadcast)
    {
        if (broadcast == null) return;

        try
        {
            if (_allowedBroadcasts == null || _allowedBroadcasts.Count == 0)
            {
                MessageBox.Show("No broadcasts are assigned to this user. Ask an admin to add broadcasts in Intercom configuration.", "No Broadcasts", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            var window = new BroadcastSlotAssignmentWindow(_allowedBroadcasts, $"Assign Broadcast Button {broadcast.SlotIndex}");
            window.WindowStartupLocation = WindowStartupLocation.CenterScreen;

            var ok = window.ShowDialog();
            if (ok != true)
            {
                return;
            }

            var selectedId = window.SelectedGroupId;
            if (string.IsNullOrWhiteSpace(selectedId))
            {
                broadcast.Id = string.Empty;
                broadcast.Name = $"Broadcast Line {broadcast.SlotIndex}";
                broadcast.IsConfigured = false;
            }
            else
            {
                var selected = _allowedBroadcasts.FirstOrDefault(a => string.Equals(a.Id, selectedId, StringComparison.OrdinalIgnoreCase));
                broadcast.Id = selectedId;
                broadcast.Name = !string.IsNullOrWhiteSpace(selected?.Name) ? selected!.Name : selectedId;
                broadcast.IsConfigured = true;
            }

            // Persist all 8 slots.
            var payload = Broadcasts
                .OrderBy(b => b.SlotIndex)
                .Select(b => new IntercomBroadcastLineSlot
                {
                    Index = b.SlotIndex,
                    GroupId = string.IsNullOrWhiteSpace(b.Id) ? null : b.Id,
                    Label = string.IsNullOrWhiteSpace(b.Id) ? null : b.Name
                })
                .ToList();

            var saved = await _userIntercomService.UpdateBroadcastLineSlotsAsync(payload);
            if (!saved)
            {
                MessageBox.Show("Failed to save broadcast button assignment. See logs for details.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                await LoadBroadcastsAsync();
            }
            else
            {
                AddNotification(PackIconKind.AccountEdit, "Broadcast buttons updated", $"Broadcast Button {broadcast.SlotIndex} was updated.");
                AddNotification(PackIconKind.LogoutVariant, "Logout required", "Logout and log back in to receive the changes.");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to configure broadcast slot");
            MessageBox.Show($"Failed to configure broadcast slot: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async Task LoadGroupCallsAsync()
    {
        try
        {
            _logger.LogInformation("Loading group call slot assignments...");

            var config = await _userIntercomService.GetUserIntercomConfigAsync();
            var slots = config?.GroupCallSlots ?? new List<IntercomGroupCallSlot>();

            try
            {
                var snap = BuildSlotsSnapshot((slots ?? new List<IntercomGroupCallSlot>()).Select(s => (s.Index, s.GroupId)));
                DetectProfileSlotChanges(PersistedGroupCallSlotsSnapshotKey, snap, "Group call buttons updated");
            }
            catch { }

            // Slot buttons are fixed at 10. Admin assigns which groups appear.
            var normalized = Enumerable.Range(1, 10)
                .Select(i => slots.FirstOrDefault(s => s.Index == i) ?? new IntercomGroupCallSlot { Index = i })
                .ToList();

            // Resolve names from the groups list we already load for the user.
            var groupLookup = Groups.ToDictionary(g => g.Id, g => g, StringComparer.OrdinalIgnoreCase);

            GroupCalls.Clear();
            foreach (var slot in normalized)
            {
                var groupId = slot.GroupId ?? string.Empty;
                var isConfigured = !string.IsNullOrWhiteSpace(groupId);
                var name = slot.Label;
                if (string.IsNullOrWhiteSpace(name) && isConfigured && groupLookup.TryGetValue(groupId, out var group))
                {
                    name = group.Name;
                }
                if (string.IsNullOrWhiteSpace(name))
                {
                    name = isConfigured ? groupId : "(Unassigned)";
                }

                GroupCalls.Add(new GroupCallSlotViewModel
                {
                    SlotIndex = slot.Index,
                    GroupId = groupId,
                    Name = name,
                    IsConfigured = isConfigured
                });
            }

            _logger.LogInformation("Loaded {Count} group call slots", GroupCalls.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load group calls");
        }
    }

    private async Task LoadDirectContactsAsync()
    {
        try
        {
            _logger.LogInformation("Loading direct contact button assignments...");

            var layout = await _userIntercomService.GetIntercomButtonLayoutAsync();
            var assignedSlots = (layout?.ContactSlots ?? new List<IntercomContactSlot>())
                .Where(s => !string.IsNullOrWhiteSpace(s.ContactUserId))
                .OrderBy(s => s.Index)
                .ToList();

            var previousDirectContacts = _directContactsBacking;

            string? ResolvePresenceForDirectContact(DirectContactViewModel vm)
            {
                try
                {
                    var target = ResolveDirectContactTargetUserId(vm);
                    if (!string.IsNullOrWhiteSpace(target))
                    {
                        var byId = _contactsBacking.FirstOrDefault(c => string.Equals(c.Id, target, StringComparison.OrdinalIgnoreCase));
                        if (byId != null) return byId.Status;

                        var byUsername = _contactsBacking.FirstOrDefault(c => string.Equals(c.Username, target, StringComparison.OrdinalIgnoreCase));
                        if (byUsername != null) return byUsername.Status;
                    }

                    var fromUri = (TryExtractUserIdFromUri(vm.Uri) ?? string.Empty).Trim();
                    if (!string.IsNullOrWhiteSpace(fromUri))
                    {
                        var byUsername = _contactsBacking.FirstOrDefault(c => string.Equals(c.Username, fromUri, StringComparison.OrdinalIgnoreCase));
                        if (byUsername != null) return byUsername.Status;

                        var byId = _contactsBacking.FirstOrDefault(c => string.Equals(c.Id, fromUri, StringComparison.OrdinalIgnoreCase));
                        if (byId != null) return byId.Status;
                    }

                    var ext = (vm.Extension ?? string.Empty).Trim();
                    if (!string.IsNullOrWhiteSpace(ext))
                    {
                        var byExt = _contactsBacking.FirstOrDefault(c => string.Equals(c.Extension, ext, StringComparison.OrdinalIgnoreCase));
                        if (byExt != null) return byExt.Status;
                    }
                }
                catch { }

                return null;
            }

            _directContactsBacking = assignedSlots
                .Select(slot =>
                {
                    var contactUserId = slot.ContactUserId ?? string.Empty;
                    var directory = _contactsBacking.FirstOrDefault(c =>
                        string.Equals(c.Id, contactUserId, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(c.Username, contactUserId, StringComparison.OrdinalIgnoreCase));

                    var vm = new DirectContactViewModel
                    {
                        Id = $"slot-{slot.Index}",
                        ContactUserId = contactUserId,
                        Name = !string.IsNullOrWhiteSpace(directory?.DisplayName)
                            ? directory!.DisplayName
                            : (!string.IsNullOrWhiteSpace(directory?.Username) ? directory!.Username! : contactUserId),
                        Uri = directory?.SipUri,
                        Extension = directory?.Extension,
                        Status = directory?.Status ?? "offline"
                    };
                    return vm;
                })
                .Select(vm =>
                {
                    // Preserve previous status (important because we now refresh periodically)
                    try
                    {
                        var prev = previousDirectContacts.FirstOrDefault(p =>
                            string.Equals(p.ContactUserId, vm.ContactUserId, StringComparison.OrdinalIgnoreCase));
                        if (prev != null && !string.IsNullOrWhiteSpace(prev.Status))
                        {
                            vm.Status = prev.Status;
                        }
                    }
                    catch { }

                    // If still offline, infer presence from directory contacts list.
                    try
                    {
                        if (string.IsNullOrWhiteSpace(vm.Status) || string.Equals(vm.Status, "offline", StringComparison.OrdinalIgnoreCase))
                        {
                            var inferred = ResolvePresenceForDirectContact(vm);
                            if (!string.IsNullOrWhiteSpace(inferred))
                            {
                                vm.Status = inferred;
                            }
                        }
                    }
                    catch { }

                    return vm;
                })
                .ToList();

            ApplySearchFilter();
            
            _logger.LogInformation("Loaded {Count} direct contacts", DirectContacts.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load direct contacts");
        }
    }

    partial void OnSearchQueryChanged(string value)
    {
        ApplySearchFilter();
        ApplyContactsFilter();
    }

    partial void OnSelectedCompanyChanged(string? value)
    {
        ApplyContactsFilter();
    }

    partial void OnSelectedLocationChanged(string? value)
    {
        ApplyContactsFilter();
    }

    partial void OnSelectedTenantScopeChanged(string? value)
    {
        ApplyContactsFilter();
    }

    private string? ResolveDirectContactTargetUserId(DirectContactViewModel contact)
    {
        try
        {
            string? Norm(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

            // 1) Prefer explicit ContactUserId
            var candidate = Norm(contact.ContactUserId);
            if (!string.IsNullOrWhiteSpace(candidate))
            {
                // If it's a stored direct-contact DB id (dc_...), it's NOT a routable user id.
                if (candidate.StartsWith("dc_", StringComparison.OrdinalIgnoreCase))
                {
                    candidate = null;
                }
            }

            // 2) If ContactUserId is present but looks like a display name (spaces) try resolve to a real username.
            if (!string.IsNullOrWhiteSpace(candidate))
            {
                var byId = _contactsBacking.FirstOrDefault(c => string.Equals(c.Id, candidate, StringComparison.OrdinalIgnoreCase));
                if (byId != null) return byId.Id;

                var byUsername = _contactsBacking.FirstOrDefault(c => string.Equals(c.Username, candidate, StringComparison.OrdinalIgnoreCase));
                if (byUsername != null) return byUsername.Username ?? byUsername.Id;
            }

            // 3) Try SIP uri username
            var fromUri = TryExtractUserIdFromUri(contact.Uri);
            if (!string.IsNullOrWhiteSpace(fromUri))
            {
                var byUsername = _contactsBacking.FirstOrDefault(c => string.Equals(c.Username, fromUri, StringComparison.OrdinalIgnoreCase));
                if (byUsername != null) return byUsername.Username ?? byUsername.Id;

                var byId = _contactsBacking.FirstOrDefault(c => string.Equals(c.Id, fromUri, StringComparison.OrdinalIgnoreCase));
                if (byId != null) return byId.Id;
            }

            // 4) Try extension match
            var ext = Norm(contact.Extension);
            if (!string.IsNullOrWhiteSpace(ext))
            {
                var byExt = _contactsBacking.FirstOrDefault(c => string.Equals(c.Extension, ext, StringComparison.OrdinalIgnoreCase));
                if (byExt != null) return byExt.Username ?? byExt.Id;
            }

            // 5) Try display name match (last resort)
            var displayName = Norm(contact.Name);
            if (!string.IsNullOrWhiteSpace(displayName))
            {
                var byName = _contactsBacking.FirstOrDefault(c => string.Equals(c.Name, displayName, StringComparison.OrdinalIgnoreCase));
                if (byName != null) return byName.Username ?? byName.Id;
            }

            // 6) Never use the DirectContact record id as a dial target.
            return null;
        }
        catch
        {
            return null;
        }
    }

    private static string? TryExtractUserIdFromUri(string? uri)
    {
        if (string.IsNullOrWhiteSpace(uri)) return null;
        try
        {
            var s = uri.Trim();
            if (s.StartsWith("sip:", StringComparison.OrdinalIgnoreCase))
            {
                s = s[4..];
            }

            var at = s.IndexOf('@');
            if (at > 0)
            {
                return s[..at];
            }

            var colon = s.IndexOf(':');
            if (colon > 0)
            {
                return s[..colon];
            }

            return s;
        }
        catch
        {
            return null;
        }
    }

    private void ApplySearchFilter()
    {
        try
        {
            var query = (SearchQuery ?? string.Empty).Trim();

            IEnumerable<DirectContactViewModel> filtered = _directContactsBacking;
            if (!string.IsNullOrWhiteSpace(query))
            {
                filtered = filtered.Where(c =>
                    (!string.IsNullOrWhiteSpace(c.Name) && c.Name.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(c.Id) && c.Id.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(c.Uri) && c.Uri.Contains(query, StringComparison.OrdinalIgnoreCase))
                );
            }

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                DirectContacts.Clear();
                foreach (var c in filtered)
                {
                    DirectContacts.Add(c);
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to apply search filter");
        }
    }

    private void ApplyContactsFilter()
    {
        try
        {
            var query = (SearchQuery ?? string.Empty).Trim();
            var selectedCompany = string.IsNullOrWhiteSpace(SelectedCompany) ? "All" : SelectedCompany;
            var selectedLocation = string.IsNullOrWhiteSpace(SelectedLocation) ? "All" : SelectedLocation;
            var selectedScope = string.IsNullOrWhiteSpace(SelectedTenantScope) ? "All" : SelectedTenantScope;
            var currentTenantId = CurrentUser?.TenantId;

            IEnumerable<ContactViewModel> filtered = _contactsBacking;

            if (!string.IsNullOrWhiteSpace(query))
            {
                filtered = filtered.Where(c =>
                    (!string.IsNullOrWhiteSpace(c.Name) && c.Name.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(c.Username) && c.Username.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(c.Id) && c.Id.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(c.SipUri) && c.SipUri.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(c.Extension) && c.Extension.Contains(query, StringComparison.OrdinalIgnoreCase))
                );
            }

            if (!string.Equals(selectedCompany, "All", StringComparison.OrdinalIgnoreCase))
            {
                filtered = filtered.Where(c => string.Equals(c.Company, selectedCompany, StringComparison.OrdinalIgnoreCase));
            }

            if (!string.Equals(selectedLocation, "All", StringComparison.OrdinalIgnoreCase))
            {
                filtered = filtered.Where(c => string.Equals(c.Location, selectedLocation, StringComparison.OrdinalIgnoreCase));
            }

            if (!string.Equals(selectedScope, "All", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Equals(selectedScope, "Internal", StringComparison.OrdinalIgnoreCase))
                {
                    if (!string.IsNullOrWhiteSpace(currentTenantId))
                    {
                        filtered = filtered.Where(c => string.Equals(c.Company, currentTenantId, StringComparison.OrdinalIgnoreCase));
                    }
                }
                else if (string.Equals(selectedScope, "Public", StringComparison.OrdinalIgnoreCase))
                {
                    if (!string.IsNullOrWhiteSpace(currentTenantId))
                    {
                        filtered = filtered.Where(c => !string.Equals(c.Company, currentTenantId, StringComparison.OrdinalIgnoreCase));
                    }
                }
            }

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                Contacts.Clear();
                foreach (var c in filtered)
                {
                    Contacts.Add(c);
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to apply contacts filter");
        }
    }

    [RelayCommand]
    private async void ToggleBroadcastMonitorForItem(BroadcastViewModel? broadcast)
    {
        if (broadcast == null) return;
        if (!broadcast.IsConfigured || string.IsNullOrWhiteSpace(broadcast.Id)) return;

        try
        {
            broadcast.IsActive = !broadcast.IsActive;
            await _socketService.EmitAsync("broadcast-monitor", new { groupId = broadcast.Id, monitor = broadcast.IsActive });

            try
            {
                await _callService.SetBroadcastMonitoringMediaAsync(broadcast.Id, broadcast.IsActive);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to update broadcast monitoring media state (groupId={GroupId})", broadcast.Id);
            }

            OnPropertyChanged(nameof(ActiveBroadcastCount));
            _logger.LogInformation("Toggled broadcast monitor: {BroadcastId}, IsActive: {IsActive}", broadcast.Id, broadcast.IsActive);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle broadcast monitor");
        }
    }

    [RelayCommand]
    private async void StartBroadcastPTT(BroadcastViewModel? broadcast)
    {
        if (broadcast == null || !broadcast.IsActive) return;

        try
        {
            // Backward-compatible stub: keep command but route to the new toggle-based behavior.
            ToggleBroadcastPTTForItem(broadcast);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start broadcast PTT");
        }
    }

    [RelayCommand]
    private async void ToggleBroadcastLatchForItem(BroadcastViewModel? broadcast)
    {
        if (broadcast == null) return;
        if (!broadcast.IsConfigured || string.IsNullOrWhiteSpace(broadcast.Id)) return;
        // Allow latch/transmit control even if the user is not monitoring.

        broadcast.IsPttLatched = !broadcast.IsPttLatched;
        _logger.LogInformation("Broadcast latch toggled: {BroadcastId}, Latched: {Latched}", broadcast.Id, broadcast.IsPttLatched);

        // Latch ON implies transmit ON.
        if (broadcast.IsPttLatched && !broadcast.IsPttTransmitting)
        {
            broadcast.IsPttTransmitting = true;
            try
            {
                await _socketService.EmitAsync("broadcast-ptt-start", new { groupId = broadcast.Id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to emit broadcast-ptt-start when latch enabled (groupId={GroupId})", broadcast.Id);
            }

            try
            {
                await _callService.SetBroadcastTransmittingMediaAsync(broadcast.Id, true);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to start broadcast transmit media when latch enabled (groupId={GroupId})", broadcast.Id);
            }

            return;
        }

        if (!broadcast.IsPttLatched && broadcast.IsPttTransmitting)
        {
            broadcast.IsPttTransmitting = false;
            _logger.LogInformation("Broadcast transmit stopped because latch was released: {BroadcastId}", broadcast.Id);

            try
            {
                await _socketService.EmitAsync("broadcast-ptt-stop", new { groupId = broadcast.Id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to emit broadcast-ptt-stop when latch released (groupId={GroupId})", broadcast.Id);
            }

            try
            {
                await _callService.SetBroadcastTransmittingMediaAsync(broadcast.Id, false);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to stop broadcast transmit media when latch released (groupId={GroupId})", broadcast.Id);
            }
        }
    }

    [RelayCommand]
    private async void ToggleBroadcastPTTForItem(BroadcastViewModel? broadcast)
    {
        if (broadcast == null) return;
        if (!broadcast.IsConfigured || string.IsNullOrWhiteSpace(broadcast.Id)) return;
        // Allow transmit control even if the user is not monitoring.

        // Backward-compatibility: keep command, but treat it as a momentary press (start).
        // Release should be handled by BroadcastPttUpCommand from the UI.
        await BroadcastPttDownAsync(broadcast);
    }

    [RelayCommand]
    private async void StartGroupCallFromGrid(GroupCallSlotViewModel? slot)
    {
        if (slot == null) return;
        if (!slot.IsConfigured || string.IsNullOrWhiteSpace(slot.GroupId)) return;

        try
        {
            await _callService.StartGroupCallAsync(slot.GroupId, CallType.Conference);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start group call from grid");
        }
    }

    [RelayCommand]
    private async void StartVoiceCall(DirectContactViewModel? contact)
    {
        if (contact == null) return;

        // Check if socket is connected
        if (!_socketService.IsConnected)
        {
            System.Windows.MessageBox.Show(
                "Cannot start call: Socket.IO connection is not available.\n\n" +
                "The real-time communication service is not connected. Please check your network connection and try again.",
                "Connection Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Warning);
            _logger.LogWarning("Attempted to start call but socket is not connected");
            return;
        }

        try
        {
            var targetUserId = ResolveDirectContactTargetUserId(contact);

            if (string.IsNullOrWhiteSpace(targetUserId))
            {
                throw new InvalidOperationException("Direct contact does not resolve to a valid directory user (username/id). Update the contact to store ContactUserId/Uri/Extension.");
            }

            _logger.LogInformation(
                "Starting direct voice call. targetUserId={TargetUserId} contactId={ContactId} displayName={DisplayName} uri={Uri} extension={Extension}",
                targetUserId,
                contact.Id,
                contact.Name,
                contact.Uri ?? "",
                contact.Extension ?? "");
            await _callService.StartCallAsync(targetUserId, CallType.Direct);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("Socket not connected") || ex.Message.Contains("Already in a call"))
        {
            var message = ex.Message.Contains("Already in a call")
                ? "You are already in a call. Please end the current call before starting a new one."
                : "Cannot start call: Socket.IO connection is not available. Please check your network connection.";
            
            System.Windows.MessageBox.Show(
                message,
                "Call Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Warning);
            _logger.LogError(ex, "Failed to start voice call: {Message}", ex.Message);
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"Failed to start call: {ex.Message}",
                "Call Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
            _logger.LogError(ex, "Failed to start voice call");
        }
    }

    [RelayCommand]
    private async void StartVideoCall(DirectContactViewModel? contact)
    {
        if (contact == null) return;

        // Check if socket is connected
        if (!_socketService.IsConnected)
        {
            System.Windows.MessageBox.Show(
                "Cannot start video call: Socket.IO connection is not available.\n\n" +
                "The real-time communication service is not connected. Please check your network connection and try again.",
                "Connection Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Warning);
            _logger.LogWarning("Attempted to start video call but socket is not connected");
            return;
        }

        try
        {
            var targetUserId = !string.IsNullOrWhiteSpace(contact.ContactUserId)
                ? contact.ContactUserId
                : contact.Id;

            if (string.IsNullOrWhiteSpace(targetUserId))
            {
                throw new InvalidOperationException("Direct contact does not have a valid user id (ContactUserId/Uri/Extension)");
            }

            _logger.LogInformation(
                "Starting direct video call. targetUserId={TargetUserId} contactId={ContactId} displayName={DisplayName} uri={Uri} extension={Extension}",
                targetUserId,
                contact.Id,
                contact.Name,
                contact.Uri ?? "",
                contact.Extension ?? "");
            await _callService.StartCallAsync(targetUserId, CallType.Direct, enableVideo: true);
            _logger.LogInformation("Starting video call to: {ContactId}", targetUserId);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("Socket not connected") || ex.Message.Contains("Already in a call"))
        {
            var message = ex.Message.Contains("Already in a call")
                ? "You are already in a call. Please end the current call before starting a new one."
                : "Cannot start video call: Socket.IO connection is not available. Please check your network connection.";
            
            System.Windows.MessageBox.Show(
                message,
                "Call Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Warning);
            _logger.LogError(ex, "Failed to start video call: {Message}", ex.Message);
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"Failed to start video call: {ex.Message}",
                "Call Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
            _logger.LogError(ex, "Failed to start video call");
        }
    }

    [RelayCommand]
    private void CreateGroup()
    {
        // TODO: Open create group dialog
        _logger.LogInformation("Create group command triggered");
    }

    [RelayCommand]
    private void AddContact()
    {
        try
        {
            if (!_authService.IsAuthenticated)
            {
                MessageBox.Show("You must be logged in to add a direct contact.", "Not authenticated", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var input = Interaction.InputBox(
                "Enter the username of the user to add as a direct contact:",
                "Add Direct Contact",
                "");

            if (string.IsNullOrWhiteSpace(input))
            {
                return;
            }

            _ = Task.Run(async () =>
            {
                var created = await _directContactService.AddDirectContactAsync(input.Trim(), input.Trim());
                if (created == null)
                {
                    Application.Current?.Dispatcher?.Invoke(() =>
                    {
                        MessageBox.Show("Failed to add direct contact. See logs for details.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    });
                    return;
                }

                await LoadDirectContactsAsync();
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Add contact command failed");
            MessageBox.Show($"Failed to add contact: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }


    private void StartCallDurationTimer()
    {
        var startTime = DateTime.Now;
        _callDurationTimer?.Stop();
        _callDurationTimer = new System.Timers.Timer(1000);
        _callDurationTimer.Elapsed += (sender, e) =>
        {
            var duration = DateTime.Now - startTime;
            CallDuration = $"{(int)duration.TotalMinutes:D2}:{duration.Seconds:D2}";
            OnPropertyChanged(nameof(CallDuration));
        };
        _callDurationTimer.Start();
    }
}

public class ContactViewModel
    : ObservableObject
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Username { get; set; }
    public string? SipUri { get; set; }
    public string? Extension { get; set; }
    public string? Department { get; set; }
    public string? Company { get; set; }
    public string? Location { get; set; }

    private string _status = "offline";
    public string Status
    {
        get => _status;
        set => SetProperty(ref _status, value);
    }

    public bool IsFavorite { get; set; } = false;
}

public partial class BroadcastViewModel : ObservableObject
{
    [ObservableProperty]
    private string _id = string.Empty;

    [ObservableProperty]
    private string _name = string.Empty;

    [ObservableProperty]
    private bool _isActive;

    [ObservableProperty]
    private int _listenerCount;

    [ObservableProperty]
    private int _slotIndex;

    [ObservableProperty]
    private bool _isConfigured;

    [ObservableProperty]
    private bool _isPttLatched;

    [ObservableProperty]
    private bool _isPttTransmitting;

    [ObservableProperty]
    private bool _isVoxActive;
}

public class DirectContactViewModel : ObservableObject
{
    public string Id { get; set; } = string.Empty;
    public string? ContactUserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Uri { get; set; }
    public string? Extension { get; set; }

    private string _status = "offline";
    public string Status
    {
        get => _status;
        set => SetProperty(ref _status, value);
    }
}
