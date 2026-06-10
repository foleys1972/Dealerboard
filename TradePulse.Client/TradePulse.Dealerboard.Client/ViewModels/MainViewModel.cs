using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using System.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using System.Windows;
using System.Windows.Threading;
using System.Windows.Media;
using MaterialDesignThemes.Wpf;
using TradePulse.Client.Core.Models;
using TradePulse.Client.Core.Services;
using TradePulse.Dealerboard.Client.Models;
using TradePulse.Dealerboard.Client.Services;
using TradePulse.Dealerboard.Client.Views;
using Interaction = Microsoft.VisualBasic.Interaction;

namespace TradePulse.Dealerboard.Client.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private const int MaxMonitors = 10;
    // Persisted monitor preference: only these lineIds should be restored to monitor mode.
    private HashSet<string> _desiredMonitoredLineIds = new(StringComparer.OrdinalIgnoreCase);
    // What we last applied automatically (so we can un-apply when preference changes).
    private HashSet<string> _appliedMonitoredLineIds = new(StringComparer.OrdinalIgnoreCase);
    private const int MaxDirectContacts = 10;

    private readonly ILogger<MainViewModel> _logger;
    private readonly IAuthService _authService;
    private readonly ISocketService _socketService;
    private readonly IDealerboardService _dealerboardService;
    private readonly IConfigurationService _configService;
    private readonly IUserService _userService;
    private readonly IDirectContactService _directContactService;
    private readonly ICallService _callService;
    private readonly IWebMediaEngineService _webMediaEngineService;
    private readonly ILineRtpBridgeService _lineRtpBridgeService;

    private string? _activeLineMediaGroupId;

    private const int MaxPages = 10;

    private DealerboardConfig _dealerboardConfig = new();
    private List<DealerboardLine> _availableLines = new();
    private List<SpeedDial> _speedDials = new();
    private List<BroadcastGroup> _broadcasts = new();
    private List<BroadcastGroup> _regularGroups = new();

    private List<User> _contactsBacking = new();
    private List<DirectContactViewModel> _directContactsBacking = new();
    private List<ContactViewModel> _contactsViewBacking = new();

    private DateTimeOffset? _lastIncomingCallStart;
    private DateTime? _callStartTimeUtc;
    private DispatcherTimer? _callDurationTimer;
    private DispatcherTimer? _lineStatusTimer;
    private HashSet<string> _privateLineIds = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _busyLineIds = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _disconnectedLineIds = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _ringingKeys = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _ringingLineIds = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, string> _incomingSipCallIds = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, (int Page, int ButtonNumber)> _lineIdToButtonLocation = new(StringComparer.OrdinalIgnoreCase);

    private DateTimeOffset? _lastNotificationAt;
    private string? _lastNotificationTitle;
    private string? _lastNotificationMessage;

    private bool _initialDataLoadStarted;

    [ObservableProperty]
    private int _currentPage = 1;

    [ObservableProperty]
    private string _dialedDigits = string.Empty;

    [ObservableProperty]
    private string _selectedLineLabel = string.Empty;

    [ObservableProperty]
    private bool _hasActiveLineCall;

    partial void OnHasActiveLineCallChanged(bool value)
    {
        OnPropertyChanged(nameof(CanEndLineCall));
    }

    [ObservableProperty]
    private bool _transferMode;

    [ObservableProperty]
    private bool _conferenceMode;

    public int GlobalRingingCount
    {
        get
        {
            if (_ringingLineIds.Count > 0) return _ringingLineIds.Count;
            return _ringingKeys.Count;
        }
    }

    public bool HasRingingLines => GlobalRingingCount > 0;

    public ObservableCollection<DealerboardButtonViewModel> Buttons { get; } = new();
    public ObservableCollection<MonitoredLineViewModel> MonitoredLines { get; } = new();

    private DealerboardButtonViewModel? _speakerActiveButton;
    private string? _selectedOutboundDdiLineId;
    private string? _activeDialLineId; // active line when dialed from keypad (not tied to a grid button)
    private DispatcherTimer? _ardRingTimer;
    private DateTimeOffset? _ardRingStopAt;

    [ObservableProperty]
    private string? _currentUsername;

    [ObservableProperty]
    private bool _isConnected;

    [ObservableProperty]
    private string _connectionStatus = "Disconnected";

    [ObservableProperty]
    private Call? _currentCall;

    [ObservableProperty]
    private string _callStatus = string.Empty;

    [ObservableProperty]
    private string _callDuration = string.Empty;

    [ObservableProperty]
    private Brush _callBannerBrush = new SolidColorBrush(Color.FromRgb(0x3b, 0x1d, 0x1d));

    public bool IsIntercomCallActive => IsCallActive && CurrentCall != null && CurrentCall.Type != CallType.Direct;

    public bool IsMuted => CurrentCall?.IsMuted == true;

    private bool _isNormalizingCallStatus;

    private static bool ShouldSuppressCallStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;

        // Suppress WebRTC init spam that should not appear in the in-call banner.
        // (Intercom WPF client does not surface these messages.)
        if (value.Contains("webrtc", StringComparison.OrdinalIgnoreCase)) return true;
        if (value.Contains("initiated", StringComparison.OrdinalIgnoreCase)) return true;

        return false;
    }

    private void UpdateCallBannerBrush(Call? call)
    {
        try
        {
            if (call == null)
            {
                CallBannerBrush = new SolidColorBrush(Color.FromRgb(0x22, 0x22, 0x22));
                return;
            }

            if (call.State == CallState.Connected)
            {
                CallBannerBrush = new SolidColorBrush(Color.FromRgb(0x16, 0xa3, 0x4a));
                return;
            }

            if (call.State == CallState.Connecting || call.State == CallState.Ringing)
            {
                CallBannerBrush = new SolidColorBrush(Color.FromRgb(0xdc, 0x26, 0x26));
                return;
            }

            CallBannerBrush = new SolidColorBrush(Color.FromRgb(0x22, 0x22, 0x22));
        }
        catch { }
    }

    partial void OnCallStatusChanged(string value)
    {
        if (_isNormalizingCallStatus)
        {
            return;
        }

        try
        {
            if (ShouldSuppressCallStatus(value))
            {
                _isNormalizingCallStatus = true;
                _callStatus = string.Empty;
                OnPropertyChanged(nameof(CallStatus));
            }
        }
        catch { }
        finally
        {
            _isNormalizingCallStatus = false;
        }
    }

    private void SetCallStatusSafe(string value)
    {
        try
        {
            if (ShouldSuppressCallStatus(value))
            {
                return;
            }
        }
        catch { }

        CallStatus = value;
    }

    [ObservableProperty]
    private bool _isPttTransmitting;

    [ObservableProperty]
    private bool _isPttLatched;

    public bool IsCallActive => CurrentCall != null && CurrentCall.State != CallState.Ended && CurrentCall.State != CallState.Failed;

    // Show the banner for either Intercom calls or Dealerboard line calls.
    public bool IsAnyCallActive => IsCallActive || HasActiveLineCall;

    public bool CanEndLineCall => HasActiveLineCall || _privateLineIds.Count > 0;

    public bool CanAddVideo => CurrentCall != null
                              && CurrentCall.Type == CallType.Direct
                              && !CurrentCall.EnableVideo
                              && CurrentCall.State != CallState.Ended
                              && CurrentCall.State != CallState.Failed;

    [ObservableProperty]
    private bool _isDndEnabled;

    [ObservableProperty]
    private bool _isIntercomCallForwardEnabled;

    [ObservableProperty]
    private bool _isLineCallForwardEnabled;

    [ObservableProperty]
    private ObservableCollection<string> _callForwardLineOptions = new();

    [ObservableProperty]
    private string? _selectedCallForwardLine;

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
    private ObservableCollection<NotificationItemViewModel> _notifications = new();

    public ObservableCollection<ContactViewModel> Contacts { get; } = new();

    public ObservableCollection<DirectContactViewModel> DirectContacts { get; } = new();

    public ObservableCollection<DirectContactSlotViewModel> DirectContactSlots { get; } = new();

    public ObservableCollection<IntercomGroupSlotViewModel> IntercomGroupSlots { get; } = new();

    public event EventHandler? LogoutRequested;

    public MainViewModel(
        ILogger<MainViewModel> logger,
        IAuthService authService,
        ISocketService socketService,
        IDealerboardService dealerboardService,
        IConfigurationService configService,
        IUserService userService,
        IDirectContactService directContactService,
        ICallService callService,
        IWebMediaEngineService webMediaEngineService,
        ILineRtpBridgeService lineRtpBridgeService)
    {
        _logger = logger;
        _authService = authService;
        _socketService = socketService;
        _dealerboardService = dealerboardService;
        _configService = configService;
        _userService = userService;
        _directContactService = directContactService;
        _callService = callService;
        _webMediaEngineService = webMediaEngineService;
        _lineRtpBridgeService = lineRtpBridgeService;

        _logger.LogInformation("MainViewModel: Constructor called");
        
        // Initialize current user
        CurrentUsername = _authService.CurrentUser?.Username;
        _logger.LogInformation("MainViewModel: Current user set to {Username}", CurrentUsername);

        // Subscribe to socket connection state
        _socketService.ConnectionStateChanged += OnConnectionStateChanged;
        _logger.LogInformation("MainViewModel: Subscribed to ConnectionStateChanged event");

        _socketService.UserStatusChanged += OnUserStatusChanged;

        _socketService.IncomingCall += OnIncomingCall;
        _socketService.CallEnded += OnCallEnded;
        _socketService.LineSipStateChanged += OnLineSipStateChanged;
        _socketService.LineSipIncoming += OnLineSipIncoming;

        _callService.CallStarted += OnCallStarted;
        _callService.CallStateChanged += OnCallServiceStateChanged;
        _callService.CallEnded += OnCallServiceEnded;

        // Subscribe to authentication events
        _authService.UserAuthenticated += OnUserAuthenticated;
        _logger.LogInformation("MainViewModel: Subscribed to UserAuthenticated event");

        // Initialize connection status
        UpdateConnectionStatus();
        _logger.LogInformation("MainViewModel: Initial connection status: {Status}", ConnectionStatus);

        InitializeButtonGrid();

        // Pre-create fixed 10 slots (Intercom parity)
        for (var i = 1; i <= MaxDirectContacts; i++)
        {
            DirectContactSlots.Add(new DirectContactSlotViewModel(i));
        }

        for (var i = 1; i <= 10; i++)
        {
            IntercomGroupSlots.Add(new IntercomGroupSlotViewModel(i));
        }

        // If we opened MainWindow with an existing token/session (no fresh login),
        // UserAuthenticated may not fire. Load directory + direct contacts immediately.
        try
        {
            if (_authService.IsAuthenticated)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await LoadContactsAsync();
                        await LoadDirectContactsAsync();
                        await ReloadDealerboardAsync();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "MainViewModel: Initial load after token auth failed");
                    }
                });
            }
        }
        catch { }
    }

    public async Task EnsureDataLoadedAsync()
    {
        try
        {
            if (_initialDataLoadStarted)
            {
                return;
            }

            _initialDataLoadStarted = true;

            if (!_authService.IsAuthenticated)
            {
                return;
            }

            try
            {
                await LoadServerNotificationsAsync();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "MainViewModel: LoadServerNotificationsAsync failed");
            }

            await LoadContactsAsync();
            await LoadDirectContactsAsync();
            await ReloadDealerboardAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MainViewModel: EnsureDataLoadedAsync failed");
        }
    }

    private async Task LoadServerNotificationsAsync()
    {
        try
        {
            var list = await _dealerboardService.GetNotificationsAsync(50);
            if (list == null) return;

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                Notifications.Clear();
                foreach (var n in list)
                {
                    var type = n.Type ?? string.Empty;
                    var title = n.Title ?? string.Empty;
                    var message = n.Message ?? string.Empty;

                    var icon = PackIconKind.Bell;
                    if (string.Equals(type, "missed-call", StringComparison.OrdinalIgnoreCase))
                    {
                        icon = PackIconKind.PhoneMissed;
                        if (string.IsNullOrWhiteSpace(title)) title = "Missed call";
                    }
                    else if (string.Equals(type, "profile-updated", StringComparison.OrdinalIgnoreCase))
                    {
                        icon = PackIconKind.AlertCircle;
                        if (string.IsNullOrWhiteSpace(title)) title = "Profile updated";
                        if (string.IsNullOrWhiteSpace(message))
                        {
                            message = "Please log off and log on again to see the changes.";
                        }
                    }

                    Notifications.Add(new NotificationItemViewModel
                    {
                        Timestamp = n.CreatedAt ?? DateTimeOffset.UtcNow,
                        IconKind = icon,
                        Title = title,
                        Message = message
                    });
                }

                while (Notifications.Count > 25)
                {
                    Notifications.RemoveAt(Notifications.Count - 1);
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to load server notifications");
        }
    }

    partial void OnCurrentCallChanged(Call? value)
    {
        try
        {
            OnPropertyChanged(nameof(IsCallActive));
            OnPropertyChanged(nameof(CanAddVideo));
            OnPropertyChanged(nameof(IsIntercomCallActive));
            OnPropertyChanged(nameof(IsMuted));

            if (value == null || value.State == CallState.Ended || value.State == CallState.Failed)
            {
                StopCallDurationTimer();
            }
            else
            {
                StartCallDurationTimer();
            }
        }
        catch { }
    }

    public sealed class ContactViewModel : ObservableObject
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Username { get; set; }
        public string? SipUri { get; set; }
        public string? Extension { get; set; }
        public string? Company { get; set; }
        public string? Location { get; set; }

        private string _status = "offline";
        public string Status
        {
            get => _status;
            set => SetProperty(ref _status, value);
        }
    }

    public sealed partial class DirectContactSlotViewModel : ObservableObject
    {
        public int SlotNumber { get; }

        [ObservableProperty]
        private DirectContactViewModel? _contact;

        public bool IsAssigned => Contact != null;

        public string ButtonLabel => $"Button {SlotNumber}";

        public string DisplayLabel => Contact != null
            ? Contact.Name
            : "(Unassigned)";

        public string Status => Contact?.Status ?? "offline";

        public DirectContactSlotViewModel(int slotNumber)
        {
            SlotNumber = slotNumber;
        }

        partial void OnContactChanged(DirectContactViewModel? value)
        {
            OnPropertyChanged(nameof(IsAssigned));
            OnPropertyChanged(nameof(ButtonLabel));
            OnPropertyChanged(nameof(DisplayLabel));
            OnPropertyChanged(nameof(Status));
        }

        public void RaisePresenceChanged()
        {
            OnPropertyChanged(nameof(Status));
        }
    }

    public sealed partial class IntercomGroupSlotViewModel : ObservableObject
    {
        public int SlotIndex { get; }

        [ObservableProperty]
        private string _groupId = string.Empty;

        [ObservableProperty]
        private string _name = "(Unassigned)";

        public bool IsConfigured => !string.IsNullOrWhiteSpace(GroupId);

        public IntercomGroupSlotViewModel(int slotIndex)
        {
            SlotIndex = slotIndex;
            _name = $"Group {slotIndex}";
        }

        partial void OnGroupIdChanged(string value)
        {
            OnPropertyChanged(nameof(IsConfigured));
        }

        partial void OnNameChanged(string value)
        {
            OnPropertyChanged(nameof(DisplayLabel));
        }

        public string DisplayLabel => IsConfigured ? Name : $"(Unassigned)";
    }

    private static string ResolveContactCallTarget(ContactViewModel contact)
    {
        if (!string.IsNullOrWhiteSpace(contact.Username))
        {
            return contact.Username.Trim();
        }

        if (!string.IsNullOrWhiteSpace(contact.Id))
        {
            return contact.Id.Trim();
        }

        return string.Empty;
    }

    private async Task<bool> EnsureIntercomSocketReadyAsync()
    {
        if (_socketService.IsConnected)
        {
            return true;
        }

        try
        {
            var token = _authService.AuthToken;
            var user = _authService.CurrentUser;
            var serverUrl = _configService.ServerUrl?.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(token) || user == null || string.IsNullOrWhiteSpace(serverUrl))
            {
                return false;
            }

            await _socketService.ConnectAsync(serverUrl, token);
            await _socketService.AuthenticateAsync(user.Id, user.Username, token);
            UpdateConnectionStatus();
            return _socketService.IsConnected;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "EnsureIntercomSocketReadyAsync failed");
            return false;
        }
    }

    private void ShowIntercomConnectionError()
    {
        MessageBox.Show(
            "Cannot start intercom call: real-time connection is not available.\n\nUse Retry in the header or log out and back in.",
            "Connection Error",
            MessageBoxButton.OK,
            MessageBoxImage.Warning);
    }

    [RelayCommand]
    private void AddDirectContactForUser(ContactViewModel? contact)
    {
        if (contact == null) return;

        var assignedCount = DirectContactSlots.Count(s => s.IsAssigned);
        if (assignedCount >= MaxDirectContacts)
        {
            MessageBox.Show($"You can only have {MaxDirectContacts} direct contacts.", "Direct contacts full", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (!_authService.IsAuthenticated)
        {
            MessageBox.Show("You must be logged in to add a direct contact.", "Not authenticated", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var username = (contact.Username ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(username))
        {
            MessageBox.Show("Selected contact does not have a username.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                // Do NOT send ownerId; server derives owner from auth token.
                var created = await _directContactService.AddDirectContactAsync(username, displayName: contact.Name, ownerId: null);
                if (created == null)
                {
                    Application.Current?.Dispatcher?.Invoke(() =>
                    {
                        MessageBox.Show("Failed to add direct contact. See logs for details.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    });
                    return;
                }

                await LoadDirectContactsAsync();
                Application.Current?.Dispatcher?.Invoke(() =>
                {
                    AddNotification(PackIconKind.AccountPlus, "Direct contact added", contact.Name ?? username);
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to add direct contact from Contacts panel");
                Application.Current?.Dispatcher?.Invoke(() =>
                {
                    MessageBox.Show($"Failed to add direct contact: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                });
            }
        });
    }

    [RelayCommand]
    private async Task StartCallForContact(ContactViewModel? contact)
    {
        if (contact == null) return;

        if (HasActiveLineCall)
        {
            MessageBox.Show(
                "End the active dealerboard line call before starting an intercom call.",
                "Line Call Active",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        if (!await EnsureIntercomSocketReadyAsync())
        {
            ShowIntercomConnectionError();
            return;
        }

        try
        {
            var target = ResolveContactCallTarget(contact);
            if (string.IsNullOrWhiteSpace(target))
            {
                throw new InvalidOperationException("Contact does not have a valid username or id.");
            }

            await _callService.StartCallAsync(target, CallType.Direct);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to start call: {ex.Message}", "Call Error", MessageBoxButton.OK, MessageBoxImage.Error);
            _logger.LogError(ex, "Failed to start voice call for contact");
        }
    }

    [RelayCommand]
    private async Task StartVideoCallForContact(ContactViewModel? contact)
    {
        if (contact == null) return;

        if (HasActiveLineCall)
        {
            MessageBox.Show(
                "End the active dealerboard line call before starting an intercom call.",
                "Line Call Active",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        if (!await EnsureIntercomSocketReadyAsync())
        {
            ShowIntercomConnectionError();
            return;
        }

        try
        {
            var target = ResolveContactCallTarget(contact);
            if (string.IsNullOrWhiteSpace(target))
            {
                throw new InvalidOperationException("Contact does not have a valid username or id.");
            }

            await _callService.StartCallAsync(target, CallType.Direct, enableVideo: true);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to start video call: {ex.Message}", "Call Error", MessageBoxButton.OK, MessageBoxImage.Error);
            _logger.LogError(ex, "Failed to start video call for contact");
        }
    }

    [RelayCommand]
    private async Task StartIntercomGroupFromSlot(IntercomGroupSlotViewModel? slot)
    {
        if (slot == null || !slot.IsConfigured || string.IsNullOrWhiteSpace(slot.GroupId))
        {
            return;
        }

        if (HasActiveLineCall)
        {
            MessageBox.Show(
                "End the active dealerboard line call before starting an intercom group call.",
                "Line Call Active",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        if (!await EnsureIntercomSocketReadyAsync())
        {
            ShowIntercomConnectionError();
            return;
        }

        try
        {
            await _callService.StartGroupCallAsync(slot.GroupId, CallType.Conference);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to start group call: {ex.Message}", "Call Error", MessageBoxButton.OK, MessageBoxImage.Error);
            _logger.LogError(ex, "Failed to start intercom group call for slot {SlotIndex}", slot.SlotIndex);
        }
    }

    public sealed partial class NotificationItemViewModel : ObservableObject
    {
        public DateTimeOffset Timestamp { get; set; }
        public PackIconKind IconKind { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;

        public string TimestampText
        {
            get
            {
                try
                {
                    var local = Timestamp.ToLocalTime();
                    return local.ToString("g");
                }
                catch
                {
                    return string.Empty;
                }
            }
        }
    }

    partial void OnSearchQueryChanged(string value)
    {
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

    public sealed class DirectContactViewModel : ObservableObject
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

    [RelayCommand]
    private async Task ToggleDnd()
    {
        try
        {
            IsDndEnabled = !IsDndEnabled;
            await _socketService.EmitAsync("set-dnd", new { enabled = IsDndEnabled });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ToggleDnd failed");
        }
    }

    [RelayCommand]
    private async Task ToggleIntercomCallForward()
    {
        try
        {
            IsIntercomCallForwardEnabled = !IsIntercomCallForwardEnabled;
            // Placeholder target username until UI collects it; server expects forwardToUsername when enabled
            var forwardToUsername = CurrentUsername ?? _authService.CurrentUser?.Username ?? "";
            await _socketService.EmitAsync("set-call-forward", new { enabled = IsIntercomCallForwardEnabled, forwardToUsername });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ToggleIntercomCallForward failed");
        }
    }

    [RelayCommand]
    private void ToggleLineCallForward()
    {
        // No server hook found yet for line call-forward allocation; keep as UI placeholder.
        IsLineCallForwardEnabled = !IsLineCallForwardEnabled;
    }

    [RelayCommand]
    private void Exit()
    {
        try { Application.Current.Shutdown(); } catch { }
    }

    [RelayCommand]
    private void AddDirectContact()
    {
        try
        {
            if (!_authService.IsAuthenticated)
            {
                MessageBox.Show("You must be logged in to add a direct contact.", "Not authenticated", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            var assignedCount = DirectContactSlots.Count(s => s.IsAssigned);
            if (assignedCount >= MaxDirectContacts)
            {
                MessageBox.Show($"You can only have {MaxDirectContacts} direct contacts.", "Direct contacts full", MessageBoxButton.OK, MessageBoxImage.Information);
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
                try
                {
                    var trimmed = input.Trim();

                    // Intercom WPF behavior: use input as both contactUserId and displayName.
                    var added = await _directContactService.AddDirectContactAsync(trimmed, trimmed);
                    if (added == null)
                    {
                        Application.Current?.Dispatcher?.Invoke(() =>
                        {
                            MessageBox.Show("Failed to add direct contact. Verify the contact exists and try again. See logs for details.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        });
                        return;
                    }

                    await LoadDirectContactsAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to add direct contact");
                    Application.Current?.Dispatcher?.Invoke(() =>
                    {
                        MessageBox.Show($"Failed to add direct contact: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    });
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AddDirectContact failed");
        }
    }

    [RelayCommand]
    private async Task StartDirectContactVoice(DirectContactViewModel? contact)
    {
        if (contact == null) return;

        if (!await EnsureIntercomSocketReadyAsync())
        {
            ShowIntercomConnectionError();
            return;
        }

        try
        {
            var targetUserId = ResolveDirectContactTargetUserId(contact);
            if (string.IsNullOrWhiteSpace(targetUserId))
            {
                throw new InvalidOperationException("Direct contact does not resolve to a valid directory user (username/id). Update the contact to store ContactUserId/Uri/Extension.");
            }

            await _callService.StartCallAsync(targetUserId, CallType.Direct);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to start call: {ex.Message}", "Call Error", MessageBoxButton.OK, MessageBoxImage.Error);
            _logger.LogError(ex, "Failed to start voice call");
        }
    }

    [RelayCommand]
    private async Task StartDirectContactVideo(DirectContactViewModel? contact)
    {
        if (contact == null) return;

        if (!await EnsureIntercomSocketReadyAsync())
        {
            ShowIntercomConnectionError();
            return;
        }

        try
        {
            var targetUserId = ResolveDirectContactTargetUserId(contact);
            if (string.IsNullOrWhiteSpace(targetUserId))
            {
                throw new InvalidOperationException("Direct contact does not resolve to a valid directory user (username/id). Update the contact to store ContactUserId/Uri/Extension.");
            }

            await _callService.StartCallAsync(targetUserId, CallType.Direct, enableVideo: true);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Failed to start video call: {ex.Message}", "Call Error", MessageBoxButton.OK, MessageBoxImage.Error);
            _logger.LogError(ex, "Failed to start video call");
        }
    }

    [RelayCommand]
    private void EditDirectContact()
    {
        // Placeholder until contacts model/service is wired.
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

    private void InitializeButtonGrid()
    {
        Buttons.Clear();
        for (var i = 1; i <= 28; i++)
        {
            Buttons.Add(new DealerboardButtonViewModel(i));
        }
    }

    private void OnUserAuthenticated(object? sender, TradePulse.Client.Core.Models.User user)
    {
        _logger.LogInformation("MainViewModel: OnUserAuthenticated called for user {Username}", user.Username);
        CurrentUsername = user.Username;
        _logger.LogInformation("MainViewModel: CurrentUsername updated to {Username}", CurrentUsername);

        _ = Task.Run(async () =>
        {
            try
            {
                await LoadContactsAsync();
                await LoadDirectContactsAsync();
                await ReloadDealerboardAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "MainViewModel: ReloadDealerboardAsync failed");
            }
        });
    }

    private async Task LoadContactsAsync()
    {
        try
        {
            if (!_authService.IsAuthenticated)
            {
                return;
            }

            var users = await _userService.GetContactsAsync();

            // Show full directory (Intercom parity): backend already controls who is returned.
            _contactsBacking = (users ?? new List<User>()).ToList();

            // Some directory endpoints exclude the current user. Intercom WPF relies on the current user
            // being resolvable by username/id (presence, direct calls). Ensure we include them.
            try
            {
                var me = _authService.CurrentUser;
                if (me != null)
                {
                    var exists = _contactsBacking.Any(u =>
                        string.Equals(u.Id, me.Id, StringComparison.OrdinalIgnoreCase)
                        || (!string.IsNullOrWhiteSpace(u.Username) && string.Equals(u.Username, me.Username, StringComparison.OrdinalIgnoreCase)));

                    if (!exists)
                    {
                        _contactsBacking.Insert(0, new User
                        {
                            Id = me.Id,
                            Username = me.Username,
                            DisplayName = me.DisplayName,
                            SipUri = me.SipUri,
                            Extension = me.Extension,
                            Status = "offline"
                        });
                    }
                }
            }
            catch { }

            _contactsViewBacking = _contactsBacking
                .Select(u => new ContactViewModel
                {
                    Id = u.Id,
                    Username = u.Username,
                    Name = !string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : u.Username,
                    SipUri = u.SipUri,
                    Extension = u.Extension,
                    Company = !string.IsNullOrWhiteSpace(u.CompanyName) ? u.CompanyName : u.TenantId,
                    Location = u.SiteId,
                    Status = u.IsOnline
                        ? ((u.Status ?? "available").Trim())
                        : "offline"
                })
                .ToList();

            try
            {
                var companies = _contactsViewBacking
                    .Select(c => c.Company)
                    .Where(c => !string.IsNullOrWhiteSpace(c))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(c => c, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                var locations = _contactsViewBacking
                    .Select(c => c.Location)
                    .Where(l => !string.IsNullOrWhiteSpace(l))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(l => l, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                Application.Current?.Dispatcher?.Invoke(() =>
                {
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

                    if (string.IsNullOrWhiteSpace(SelectedCompany) || !CompanyOptions.Contains(SelectedCompany))
                    {
                        SelectedCompany = "All";
                    }

                    if (string.IsNullOrWhiteSpace(SelectedLocation) || !LocationOptions.Contains(SelectedLocation))
                    {
                        SelectedLocation = "All";
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to build contacts filter option lists");
            }

            ApplyContactsFilter();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load contacts");
            _contactsBacking = new List<User>();
            _contactsViewBacking = new List<ContactViewModel>();

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                Contacts.Clear();
            });
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
            var currentTenantId = _authService.CurrentUser?.TenantId;

            IEnumerable<ContactViewModel> filtered = _contactsViewBacking;
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

    private void AddNotification(PackIconKind icon, string title, string message)
    {
        try
        {
            if ((!string.IsNullOrWhiteSpace(title)
                    && title.Contains("webrtc", StringComparison.OrdinalIgnoreCase))
                || (!string.IsNullOrWhiteSpace(message)
                    && message.Contains("webrtc", StringComparison.OrdinalIgnoreCase)))
            {
                return;
            }

            try
            {
                // De-dupe repeated/noisy notifications (e.g. WebRTC init spam)
                var now = DateTimeOffset.UtcNow;
                if (_lastNotificationAt.HasValue
                    && (now - _lastNotificationAt.Value).TotalSeconds <= 10
                    && string.Equals(_lastNotificationTitle, title, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(_lastNotificationMessage, message, StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                _lastNotificationAt = now;
                _lastNotificationTitle = title;
                _lastNotificationMessage = message;
            }
            catch { }

            var n = new NotificationItemViewModel
            {
                Timestamp = DateTimeOffset.UtcNow,
                IconKind = icon,
                Title = title,
                Message = message
            };

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                Notifications.Insert(0, n);
                while (Notifications.Count > 25)
                {
                    Notifications.RemoveAt(Notifications.Count - 1);
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to add notification");
        }
    }

    private void OnIncomingCall(object? sender, Call call)
    {
        try
        {
            _lastIncomingCallStart = DateTimeOffset.UtcNow;
            AddNotification(PackIconKind.PhoneIncoming, "Call received", $"From {call.CallerName ?? call.CallerId ?? "Unknown"}");
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to handle incoming call notification");
        }
    }

    private void OnCallStarted(object? sender, Call call)
    {
        try
        {
            Application.Current?.Dispatcher?.Invoke(() =>
            {
                CurrentCall = call;
                _callStartTimeUtc = call.StartTime == default ? DateTime.UtcNow : call.StartTime;
                UpdateCallBannerBrush(call);
                SetCallStatusSafe(call.Type == CallType.Direct
                    ? $"Calling {call.TargetName ?? call.TargetId ?? "Unknown"}..."
                    : $"Connecting to group {call.GroupName ?? call.GroupId ?? "Group"}...");
                OnPropertyChanged(nameof(IsCallActive));
                OnPropertyChanged(nameof(CanAddVideo));
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to handle CallStarted");
        }
    }

    private void OnCallServiceStateChanged(object? sender, Call call)
    {
        try
        {
            Application.Current?.Dispatcher?.Invoke(() =>
            {
                CurrentCall = call;
                if (_callStartTimeUtc == null)
                {
                    _callStartTimeUtc = call.StartTime == default ? DateTime.UtcNow : call.StartTime;
                }

                UpdateCallBannerBrush(call);

                switch (call.State)
                {
                    case CallState.Ringing:
                        SetCallStatusSafe($"Incoming call from {call.CallerName ?? call.CallerId ?? "Unknown"}");
                        break;
                    case CallState.Connecting:
                        SetCallStatusSafe(call.Type == CallType.Direct
                            ? $"Calling {call.TargetName ?? call.TargetId ?? "Unknown"}..."
                            : $"Connecting to group {call.GroupName ?? call.GroupId ?? "Group"}...");
                        break;
                    case CallState.Connected:
                        {
                            var currentUserId = _authService.CurrentUser?.Id
                                ?? _authService.CurrentUser?.Username
                                ?? CurrentUsername;
                            var isOutgoing = !string.IsNullOrWhiteSpace(currentUserId)
                                && !string.IsNullOrWhiteSpace(call.CallerId)
                                && string.Equals(call.CallerId, currentUserId, StringComparison.OrdinalIgnoreCase);

                            if (call.Type == CallType.Direct)
                            {
                                SetCallStatusSafe(isOutgoing
                                    ? $"Connected to {call.TargetName ?? call.TargetId ?? "Unknown"}"
                                    : $"Connected to {call.CallerName ?? call.CallerId ?? "Unknown"}");
                            }
                            else
                            {
                                SetCallStatusSafe($"Connected to {call.GroupName ?? call.GroupId ?? "Group"}");
                            }
                        }
                        break;
                    case CallState.Ended:
                        SetCallStatusSafe("Call ended");
                        CurrentCall = null;
                        UpdateCallBannerBrush(null);
                        break;
                    case CallState.Failed:
                        SetCallStatusSafe("Call failed");
                        CurrentCall = null;
                        UpdateCallBannerBrush(null);
                        break;
                }

                OnPropertyChanged(nameof(IsCallActive));
                OnPropertyChanged(nameof(CanAddVideo));
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to handle CallStateChanged");
        }
    }

    private void OnCallServiceEnded(object? sender, string callId)
    {
        try
        {
            Application.Current?.Dispatcher?.Invoke(() =>
            {
                CurrentCall = null;
                SetCallStatusSafe(string.Empty);
                CallDuration = string.Empty;
                IsPttTransmitting = false;
                IsPttLatched = false;
                UpdateCallBannerBrush(null);
            });
            OnPropertyChanged(nameof(IsCallActive));
            OnPropertyChanged(nameof(CanAddVideo));
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to handle call ended state");
        }
        finally
        {
            StopCallDurationTimer();
            _callStartTimeUtc = null;
        }
    }

    [RelayCommand]
    private async Task PttDown()
    {
        if (CurrentCall == null)
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
    private async Task PttUp()
    {
        if (CurrentCall == null)
        {
            return;
        }

        if (IsPttLatched)
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
    private async Task ToggleLatch()
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
                await _socketService.EmitAsync("ptt-start", new { callId = CurrentCall.Id });
                IsPttTransmitting = true;
                return;
            }

            IsPttLatched = false;
            await _socketService.EmitAsync("ptt-stop", new { callId = CurrentCall.Id });
            IsPttTransmitting = false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle latch");
        }
    }

    [RelayCommand]
    private async Task Mute()
    {
        if (CurrentCall == null)
        {
            return;
        }

        try
        {
            var next = !CurrentCall.IsMuted;
            await _callService.MuteCallAsync(CurrentCall.Id, next);
            CurrentCall.IsMuted = next;
            OnPropertyChanged(nameof(IsMuted));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle mute");
        }
    }

    private void OnCallEnded(object? sender, string callId)
    {
        try
        {
            if (_lastIncomingCallStart.HasValue && (DateTimeOffset.UtcNow - _lastIncomingCallStart.Value).TotalSeconds <= 15)
            {
                AddNotification(PackIconKind.PhoneMissed, "Missed call", "You missed a call");
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to handle call ended notification");
        }
        finally
        {
            _lastIncomingCallStart = null;
        }
    }

    private void StartCallDurationTimer()
    {
        try
        {
            if (_callDurationTimer == null)
            {
                _callDurationTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromSeconds(1)
                };

                _callDurationTimer.Tick += (_, __) =>
                {
                    try
                    {
                        if ((!IsCallActive && !HasActiveLineCall) || _callStartTimeUtc == null)
                        {
                            CallDuration = string.Empty;
                            return;
                        }

                        var duration = DateTime.UtcNow - _callStartTimeUtc.Value;
                        CallDuration = $"{(int)duration.TotalMinutes:D2}:{duration.Seconds:D2}";
                    }
                    catch { }
                };
            }

            if (!_callDurationTimer.IsEnabled)
            {
                _callDurationTimer.Start();
            }
        }
        catch { }
    }

    private void StopCallDurationTimer()
    {
        try
        {
            if (_callDurationTimer != null && _callDurationTimer.IsEnabled)
            {
                _callDurationTimer.Stop();
            }
        }
        catch { }
    }

    [RelayCommand]
    private async Task Hangup()
    {
        try
        {
            var callId = CurrentCall?.Id;
            if (string.IsNullOrWhiteSpace(callId))
            {
                return;
            }

            await _callService.HangupCallAsync(callId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to hang up call");
            MessageBox.Show($"Failed to end call: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task AddVideo()
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

            await _socketService.EmitAsync("instant-enable-video", new { callId = CurrentCall.Id, enableVideo = true });

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

    private async Task LoadDirectContactsAsync()
    {
        try
        {
            // Do NOT send ownerId; server derives owner from auth token.
            var contacts = await _directContactService.GetDirectContactsAsync(ownerId: null);
            var previous = _directContactsBacking;

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

            _directContactsBacking = (contacts ?? Array.Empty<DirectContact>())
                .Take(MaxDirectContacts)
                .Select(c => new DirectContactViewModel
                {
                    Id = c.Id,
                    ContactUserId = !string.IsNullOrWhiteSpace(c.ContactUserId)
                        ? c.ContactUserId
                        : (TryExtractUserIdFromUri(c.Uri) ?? c.Extension),
                    Name = !string.IsNullOrWhiteSpace(c.DisplayName)
                        ? c.DisplayName
                        : (!string.IsNullOrWhiteSpace(c.ContactUserId) ? c.ContactUserId : "Direct Contact"),
                    Uri = c.Uri,
                    Extension = c.Extension,
                    Status = "offline"
                })
                .Select(vm =>
                {
                    try
                    {
                        var prev = previous.FirstOrDefault(p => string.Equals(p.Id, vm.Id, StringComparison.OrdinalIgnoreCase));
                        if (prev != null && !string.IsNullOrWhiteSpace(prev.Status))
                        {
                            vm.Status = prev.Status;
                        }
                    }
                    catch { }

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

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                DirectContacts.Clear();
                foreach (var c in _directContactsBacking)
                {
                    DirectContacts.Add(c);
                }

                // Fill fixed slots (Button 1-10). Any extras are ignored by .Take(MaxDirectContacts) above.
                for (var i = 0; i < DirectContactSlots.Count; i++)
                {
                    DirectContactSlots[i].Contact = i < _directContactsBacking.Count
                        ? _directContactsBacking[i]
                        : null;
                }

                ApplyIntercomContactSlotsOnDispatcher();
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load direct contacts");
        }
    }

    private void ApplyIntercomContactSlotsOnDispatcher()
    {
        for (var i = 0; i < DirectContactSlots.Count; i++)
        {
            var slotIndex = i + 1;
            var slot = DirectContactSlots[i];
            if (!_dealerboardConfig.Intercom.Contacts.TryGetValue(slotIndex, out var assignment) ||
                string.IsNullOrWhiteSpace(assignment.ContactUserId))
            {
                continue;
            }

            var contactUserId = assignment.ContactUserId!;
            var directory = _contactsBacking.FirstOrDefault(c =>
                string.Equals(c.Id, contactUserId, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(c.Username, contactUserId, StringComparison.OrdinalIgnoreCase));

            slot.Contact = new DirectContactViewModel
            {
                Id = $"admin-slot-{slotIndex}",
                ContactUserId = contactUserId,
                Name = !string.IsNullOrWhiteSpace(directory?.DisplayName)
                    ? directory!.DisplayName!
                    : (!string.IsNullOrWhiteSpace(directory?.Username) ? directory!.Username! : contactUserId),
                Uri = directory?.SipUri,
                Extension = directory?.Extension,
                Status = directory?.Status ?? "offline"
            };
        }
    }

    private void OnUserStatusChanged(object? sender, User user)
    {
        try
        {
            var uid = (user.Id ?? string.Empty).Trim();
            var uname = (user.Username ?? string.Empty).Trim();
            var status = (user.Status ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(uid) && string.IsNullOrWhiteSpace(uname))
            {
                return;
            }

            var presence = string.IsNullOrWhiteSpace(status) ? "offline" : status;

            static string? SipUserPart(string? sipUri)
            {
                if (string.IsNullOrWhiteSpace(sipUri)) return null;
                try
                {
                    var s = sipUri.Trim();
                    if (s.StartsWith("sip:", StringComparison.OrdinalIgnoreCase))
                    {
                        s = s[4..];
                    }

                    var at = s.IndexOf('@');
                    if (at > 0)
                    {
                        return s[..at];
                    }

                    return s;
                }
                catch
                {
                    return null;
                }
            }

            bool MatchesDirectoryUser(User candidate)
            {
                try
                {
                    var cid = (candidate.Id ?? string.Empty).Trim();
                    var cun = (candidate.Username ?? string.Empty).Trim();
                    var cext = (candidate.Extension ?? string.Empty).Trim();
                    var csipUser = (SipUserPart(candidate.SipUri) ?? string.Empty).Trim();

                    if (!string.IsNullOrWhiteSpace(uid))
                    {
                        // Some socket payloads put username into userId.
                        if (string.Equals(cid, uid, StringComparison.OrdinalIgnoreCase)) return true;
                        if (string.Equals(cun, uid, StringComparison.OrdinalIgnoreCase)) return true;
                        // Some payloads put extension or SIP user-part into userId.
                        if (!string.IsNullOrWhiteSpace(cext) && string.Equals(cext, uid, StringComparison.OrdinalIgnoreCase)) return true;
                        if (!string.IsNullOrWhiteSpace(csipUser) && string.Equals(csipUser, uid, StringComparison.OrdinalIgnoreCase)) return true;
                    }

                    if (!string.IsNullOrWhiteSpace(uname))
                    {
                        // And vice-versa.
                        if (string.Equals(cun, uname, StringComparison.OrdinalIgnoreCase)) return true;
                        if (string.Equals(cid, uname, StringComparison.OrdinalIgnoreCase)) return true;
                        if (!string.IsNullOrWhiteSpace(cext) && string.Equals(cext, uname, StringComparison.OrdinalIgnoreCase)) return true;
                        if (!string.IsNullOrWhiteSpace(csipUser) && string.Equals(csipUser, uname, StringComparison.OrdinalIgnoreCase)) return true;
                    }

                    return false;
                }
                catch
                {
                    return false;
                }
            }

            // Update directory cache
            foreach (var c in _contactsBacking)
            {
                if (MatchesDirectoryUser(c))
                {
                    c.Status = presence;
                }
            }

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                foreach (var c in Contacts)
                {
                    if (c == null) continue;

                    var cext = (c.Extension ?? string.Empty).Trim();
                    var csipUser = (SipUserPart(c.SipUri) ?? string.Empty).Trim();

                    // Apply same matching logic used for directory cache.
                    if (!string.IsNullOrWhiteSpace(uid) && (
                            string.Equals(c.Id, uid, StringComparison.OrdinalIgnoreCase)
                            || string.Equals(c.Username, uid, StringComparison.OrdinalIgnoreCase)
                            || (!string.IsNullOrWhiteSpace(cext) && string.Equals(cext, uid, StringComparison.OrdinalIgnoreCase))
                            || (!string.IsNullOrWhiteSpace(csipUser) && string.Equals(csipUser, uid, StringComparison.OrdinalIgnoreCase))
                        ))
                    {
                        c.Status = presence;
                        continue;
                    }

                    if (!string.IsNullOrWhiteSpace(uname) && (
                            string.Equals(c.Username, uname, StringComparison.OrdinalIgnoreCase)
                            || string.Equals(c.Id, uname, StringComparison.OrdinalIgnoreCase)
                            || (!string.IsNullOrWhiteSpace(cext) && string.Equals(cext, uname, StringComparison.OrdinalIgnoreCase))
                            || (!string.IsNullOrWhiteSpace(csipUser) && string.Equals(csipUser, uname, StringComparison.OrdinalIgnoreCase))
                        ))
                    {
                        c.Status = presence;
                    }
                }
            });

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                foreach (var dc in DirectContacts)
                {
                    if (dc == null) continue;

                    var target = ResolveDirectContactTargetUserId(dc);
                    if (string.IsNullOrWhiteSpace(target)) continue;

                    if (!string.IsNullOrWhiteSpace(uid) && string.Equals(target, uid, StringComparison.OrdinalIgnoreCase))
                    {
                        dc.Status = presence;
                        continue;
                    }

                    if (!string.IsNullOrWhiteSpace(uname) && string.Equals(target, uname, StringComparison.OrdinalIgnoreCase))
                    {
                        dc.Status = presence;
                    }
                }
            });

            Application.Current?.Dispatcher?.Invoke(() =>
            {
                foreach (var slot in DirectContactSlots)
                {
                    slot?.RaisePresenceChanged();
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to apply presence update to direct contacts");
        }
    }

    private string? ResolveDirectContactTargetUserId(DirectContactViewModel contact)
    {
        try
        {
            string? Norm(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

            var candidate = Norm(contact.ContactUserId);
            if (!string.IsNullOrWhiteSpace(candidate))
            {
                if (candidate.StartsWith("dc_", StringComparison.OrdinalIgnoreCase))
                {
                    candidate = null;
                }
            }

            if (!string.IsNullOrWhiteSpace(candidate))
            {
                var byId = _contactsBacking.FirstOrDefault(c => string.Equals(c.Id, candidate, StringComparison.OrdinalIgnoreCase));
                if (byId != null) return byId.Id;

                var byUsername = _contactsBacking.FirstOrDefault(c => string.Equals(c.Username, candidate, StringComparison.OrdinalIgnoreCase));
                if (byUsername != null) return byUsername.Username ?? byUsername.Id;

                // Allow calling by username/id even if the directory list is missing the user.
                // This avoids blocking voice-only calls when the backend directory is filtered.
                return candidate;
            }

            var fromUri = TryExtractUserIdFromUri(contact.Uri);
            if (!string.IsNullOrWhiteSpace(fromUri))
            {
                var byUsername = _contactsBacking.FirstOrDefault(c => string.Equals(c.Username, fromUri, StringComparison.OrdinalIgnoreCase));
                if (byUsername != null) return byUsername.Username ?? byUsername.Id;

                var byId = _contactsBacking.FirstOrDefault(c => string.Equals(c.Id, fromUri, StringComparison.OrdinalIgnoreCase));
                if (byId != null) return byId.Id;

                return fromUri;
            }

            var ext = Norm(contact.Extension);
            if (!string.IsNullOrWhiteSpace(ext))
            {
                var byExt = _contactsBacking.FirstOrDefault(c => string.Equals(c.Extension, ext, StringComparison.OrdinalIgnoreCase));
                if (byExt != null) return byExt.Username ?? byExt.Id;

                return ext;
            }

            var displayName = Norm(contact.Name);
            if (!string.IsNullOrWhiteSpace(displayName))
            {
                var byDisplayName = _contactsBacking.FirstOrDefault(c => string.Equals(c.DisplayName, displayName, StringComparison.OrdinalIgnoreCase));
                if (byDisplayName != null) return byDisplayName.Username ?? byDisplayName.Id;

                var byUsername = _contactsBacking.FirstOrDefault(c => string.Equals(c.Username, displayName, StringComparison.OrdinalIgnoreCase));
                if (byUsername != null) return byUsername.Username ?? byUsername.Id;
            }

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

    private async Task ReloadDealerboardAsync()
    {
        var userId = _authService.CurrentUser?.Id;
        if (string.IsNullOrWhiteSpace(userId))
        {
            _logger.LogWarning("MainViewModel: Cannot load dealerboard - no CurrentUser.Id");
            return;
        }

        var configTask = _dealerboardService.GetConfigAsync(userId);
        var linesTask = _dealerboardService.GetAvailableLinesAsync();
        var speedTask = _dealerboardService.GetSpeedDialsAsync(userId);
        var broadcastTask = _dealerboardService.GetBroadcastsAsync();
        var groupsTask = _dealerboardService.GetRegularGroupsAsync();

        await Task.WhenAll(configTask, linesTask, speedTask, broadcastTask, groupsTask);

        _dealerboardConfig = configTask.Result ?? new DealerboardConfig();
        RebuildLineIdButtonIndex();
        _availableLines = linesTask.Result ?? new List<DealerboardLine>();
        _speedDials = speedTask.Result ?? new List<SpeedDial>();
        _broadcasts = broadcastTask.Result ?? new List<BroadcastGroup>();
        _regularGroups = groupsTask.Result ?? new List<BroadcastGroup>();

        // Restore monitor state strictly from persisted preference (not based on HOOT/broadcast/etc).
        LoadDesiredMonitorsFromPreferences();
        await SyncMonitorsFromPreferenceAsync();

        // Start/refresh line busy/ringing polling so users see shared busy state across endpoints.
        StartLineStatusPolling(userId);

        _logger.LogInformation(
            "Dealerboard loaded for user {UserId}: {AssignmentPages} page(s), {LineCount} line(s)",
            userId,
            _dealerboardConfig.Assignments?.Count ?? 0,
            _availableLines.Count);

        CallForwardLineOptions.Clear();
        foreach (var line in _availableLines)
        {
            if (!string.IsNullOrWhiteSpace(line?.Label))
            {
                CallForwardLineOptions.Add(line.Label);
            }
        }
        if (CallForwardLineOptions.Count > 0 && string.IsNullOrWhiteSpace(SelectedCallForwardLine))
        {
            SelectedCallForwardLine = CallForwardLineOptions[0];
        }

        if (Application.Current?.Dispatcher != null)
        {
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                ApplyCurrentPageToButtons();
                ApplyIntercomGroupSlots();
            });
        }
        else
        {
            ApplyCurrentPageToButtons();
            ApplyIntercomGroupSlots();
        }
    }

    private void ApplyIntercomGroupSlots()
    {
        try
        {
            Application.Current?.Dispatcher?.Invoke(() =>
            {
                for (var i = 0; i < IntercomGroupSlots.Count; i++)
                {
                    var slotIndex = i + 1;
                    var slot = IntercomGroupSlots[i];
                    _dealerboardConfig.Intercom.Groups.TryGetValue(slotIndex, out var assignment);
                    var groupId = assignment?.GroupId ?? string.Empty;
                    slot.GroupId = groupId;
                    if (string.IsNullOrWhiteSpace(groupId))
                    {
                        slot.Name = $"Group {slotIndex}";
                        continue;
                    }

                    var group = _regularGroups.FirstOrDefault(g => string.Equals(g.Id, groupId, StringComparison.OrdinalIgnoreCase));
                    slot.Name = !string.IsNullOrWhiteSpace(group?.Name) ? group!.Name : groupId;
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ApplyIntercomGroupSlots failed");
        }
    }

    private void ApplyIntercomContactSlots()
    {
        try
        {
            Application.Current?.Dispatcher?.Invoke(ApplyIntercomContactSlotsOnDispatcher);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ApplyIntercomContactSlots failed");
        }
    }

    private string? GetDefaultDialToneLineId()
    {
        try
        {
            // Prefer explicit selection, otherwise user preference DefaultDdiLineId, otherwise first DDI line.
            if (!string.IsNullOrWhiteSpace(_selectedOutboundDdiLineId)) return _selectedOutboundDdiLineId;

            var pref = _dealerboardConfig?.Preferences?.DefaultDdiLineId;
            if (!string.IsNullOrWhiteSpace(pref)) return pref;

            var first = _availableLines.FirstOrDefault(l => string.Equals(l.Type, "DDI", StringComparison.OrdinalIgnoreCase))?.Id;
            return first;
        }
        catch
        {
            return null;
        }
    }

    [RelayCommand]
    private async Task DialCall()
    {
        try
        {
            var digits = (DialedDigits ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(digits))
            {
                AddNotification(PackIconKind.AlertCircle, "Call", "Enter a number to dial.");
                return;
            }

            if (HasActiveLineCall)
            {
                AddNotification(PackIconKind.AlertCircle, "Call", "A line call is already active. End it before starting a new call.");
                return;
            }

            var lineId = GetDefaultDialToneLineId();
            if (string.IsNullOrWhiteSpace(lineId))
            {
                AddNotification(PackIconKind.AlertCircle, "Call", "No default dial-tone (DDI) line is configured for this user.");
                return;
            }

            // Place call using the selected/default DDI line.
            await _dealerboardService.CallDdiLineAsync(lineId, digits);

            _activeDialLineId = lineId;
            HasActiveLineCall = true;
            OnPropertyChanged(nameof(IsAnyCallActive));

            _callStartTimeUtc = DateTime.UtcNow;
            CallBannerBrush = new SolidColorBrush(Color.FromRgb(0x16, 0xa3, 0x4a)); // green
            SetCallStatusSafe($"Connected (Dial) — {digits}");
            StartCallDurationTimer();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "DialCall failed");
            AddNotification(PackIconKind.AlertCircle, "Call", "Failed to start call.");
        }
    }

    private HashSet<string> GetAssignedLineIds()
    {
        return new HashSet<string>(_lineIdToButtonLocation.Keys, StringComparer.OrdinalIgnoreCase);
    }

    private void StartLineStatusPolling(string userId)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(userId)) return;

            if (_lineStatusTimer == null)
            {
                _lineStatusTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(1500) };
                _lineStatusTimer.Tick += async (_, __) =>
                {
                    try
                    {
                        var lineStatus = await _dealerboardService.GetLineButtonStatusAsync(userId);
                        _privateLineIds = lineStatus.PrivateLineIds;
                        _busyLineIds = lineStatus.BusyLineIds;
                        _disconnectedLineIds = lineStatus.DisconnectedLineIds;

                        var serverRingingIds = new HashSet<string>(
                            lineStatus.RingingLineIds,
                            StringComparer.OrdinalIgnoreCase);
                        _ringingKeys = new HashSet<string>(lineStatus.RingingKeys, StringComparer.OrdinalIgnoreCase);

                        foreach (var assignedId in GetAssignedLineIds())
                        {
                            if (!serverRingingIds.Contains(assignedId))
                            {
                                _ringingLineIds.Remove(assignedId);
                            }
                        }
                        foreach (var id in serverRingingIds)
                        {
                            _ringingLineIds.Add(id);
                        }

                        NotifyRingingCountChanged();
                        ApplyCurrentPageToButtons();
                    }
                    catch { }
                };
            }

            if (!_lineStatusTimer.IsEnabled)
            {
                _lineStatusTimer.Start();
            }
        }
        catch { }
    }

    private void LoadDesiredMonitorsFromPreferences()
    {
        _desiredMonitoredLineIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var prefs = _dealerboardConfig?.Preferences?.Preferences;
            if (prefs == null) return;

            if (!prefs.TryGetValue("monitoredLineIds", out var raw) || raw == null) return;

            // Typical case: JSON round-trips as JsonElement.
            if (raw is System.Text.Json.JsonElement je)
            {
                if (je.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var el in je.EnumerateArray())
                    {
                        var s = el.ValueKind == System.Text.Json.JsonValueKind.String ? el.GetString() : el.ToString();
                        if (!string.IsNullOrWhiteSpace(s)) _desiredMonitoredLineIds.Add(s);
                    }
                    return;
                }

                if (je.ValueKind == System.Text.Json.JsonValueKind.String)
                {
                    var s = je.GetString();
                    if (!string.IsNullOrWhiteSpace(s)) _desiredMonitoredLineIds.Add(s);
                    return;
                }
            }

            // Fallback for other shapes.
            if (raw is IEnumerable<object> seq)
            {
                foreach (var o in seq)
                {
                    var s = o?.ToString();
                    if (!string.IsNullOrWhiteSpace(s)) _desiredMonitoredLineIds.Add(s);
                }
                return;
            }

            // Final fallback: single string.
            var single = raw.ToString();
            if (!string.IsNullOrWhiteSpace(single)) _desiredMonitoredLineIds.Add(single);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse monitoredLineIds preference");
        }
    }

    private void OnLineSipIncoming(object? sender, LineSipStateEvent evt)
    {
        if (string.IsNullOrWhiteSpace(evt.LineId)) return;

        try
        {
            var status = (evt.Status ?? string.Empty).Trim().ToLowerInvariant();
            var shouldAutoJoin = status == "connected";

            Application.Current?.Dispatcher?.BeginInvoke(async () =>
            {
                _ringingLineIds.Add(evt.LineId);
                if (!string.IsNullOrWhiteSpace(evt.SipCallId))
                {
                    _incomingSipCallIds[evt.LineId] = evt.SipCallId;
                }

                if (shouldAutoJoin)
                {
                    await TryAutoJoinIncomingLineAsync(evt.LineId);
                    return;
                }

                if (TryGetButtonForLineId(evt.LineId, out var pageNumber, out var buttonNumber, out _))
                {
                    _ringingKeys.Add($"{pageNumber}-{buttonNumber}");
                }

                // Audible ring for the incoming side (rings until answered/ended, max 30s)
                StartArdRingtone(30);

                NotifyRingingCountChanged();
                AddNotification(PackIconKind.PhoneIncoming, "Incoming line call", "Tap the ringing banner to go to the line and answer.");
                ApplyCurrentPageToButtons();
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "OnLineSipIncoming failed");
        }
    }

    private async Task TryAutoJoinIncomingLineAsync(string lineId)
    {
        if (!TryGetButtonForLineId(lineId, out var pageNumber, out var buttonNumber, out _))
        {
            return;
        }

        if (pageNumber != CurrentPage)
        {
            CurrentPage = pageNumber;
            ApplyCurrentPageToButtons();
        }

        var button = Buttons.FirstOrDefault(b => b.ButtonNumber == buttonNumber);
        if (button == null || button.IsPrivate)
        {
            return;
        }

        try
        {
            await AnswerIncomingLineAsync(button, lineId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Auto-join incoming internal line failed for {LineId}", lineId);
        }
    }

    private void OnLineSipStateChanged(object? sender, LineSipStateEvent evt)
    {
        if (string.IsNullOrWhiteSpace(evt.LineId)) return;

        try
        {
            Application.Current?.Dispatcher?.BeginInvoke(() =>
            {
                var status = (evt.Status ?? string.Empty).Trim().ToLowerInvariant();
                var reason = (evt.Reason ?? string.Empty).Trim().ToLowerInvariant();

                if (status is "ringing" or "incoming" or "initiating")
                {
                    _ringingLineIds.Add(evt.LineId);
                    if (!string.IsNullOrWhiteSpace(evt.SipCallId))
                    {
                        _incomingSipCallIds[evt.LineId] = evt.SipCallId;
                    }
                    if (TryGetButtonForLineId(evt.LineId, out var pageNumber, out var buttonNumber, out _))
                    {
                        _ringingKeys.Add($"{pageNumber}-{buttonNumber}");
                    }
                }
                else if (status == "connected")
                {
                    _ringingLineIds.Remove(evt.LineId);
                    _incomingSipCallIds.Remove(evt.LineId);
                    var connectedButtonNumber = 0;
                    if (TryGetButtonForLineId(evt.LineId, out var pageNumber, out connectedButtonNumber, out _))
                    {
                        _ringingKeys.Remove($"{pageNumber}-{connectedButtonNumber}");
                    }
                    StopArdRingtone();
                    if (HasActiveLineCall && _privateLineIds.Contains(evt.LineId) && !IsCallActive)
                    {
                        var label = connectedButtonNumber > 0
                            ? Buttons.FirstOrDefault(b => b.ButtonNumber == connectedButtonNumber)?.DisplayLabel
                            : null;
                        label ??= SelectedLineLabel ?? "Line";
                        SetLineCallBanner(label, ringing: false);
                    }
                }
                else if (reason == "line_released" || status is "idle" or "ended")
                {
                    var wasActiveLine = _privateLineIds.Contains(evt.LineId)
                        || string.Equals(
                            _speakerActiveButton?.Assignment?.LineId,
                            evt.LineId,
                            StringComparison.OrdinalIgnoreCase)
                        || string.Equals(
                            _speakerActiveButton?.Assignment?.DdiLineId,
                            evt.LineId,
                            StringComparison.OrdinalIgnoreCase);

                    _ringingLineIds.Remove(evt.LineId);
                    _incomingSipCallIds.Remove(evt.LineId);
                    if (TryGetButtonForLineId(evt.LineId, out var pageNumber, out var buttonNumber, out _))
                    {
                        _ringingKeys.Remove($"{pageNumber}-{buttonNumber}");
                    }
                    _privateLineIds.Remove(evt.LineId);
                    _busyLineIds.Remove(evt.LineId);
                    if (_ringingLineIds.Count == 0)
                    {
                        StopArdRingtone();
                    }

                    if (wasActiveLine && (status is "ended" or "idle" || reason == "line_released"))
                    {
                        _ = Application.Current?.Dispatcher?.BeginInvoke(async () =>
                        {
                            await StopLineMediaAsync();
                            await ClearLocalLineCallStateAsync(evt.LineId);
                        });
                    }
                }

                if (reason == "sbc_path_changed" && evt.SbcRole == "secondary")
                {
                    _disconnectedLineIds.Remove(evt.LineId);
                }

                NotifyRingingCountChanged();
                ApplyCurrentPageToButtons();
            });
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "OnLineSipStateChanged failed");
        }
    }

    private async Task SyncMonitorsFromPreferenceAsync()
    {
        try
        {
            var desired = _desiredMonitoredLineIds
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxMonitors)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (var oldId in _appliedMonitoredLineIds)
            {
                if (desired.Contains(oldId)) continue;
                try
                {
                    await _dealerboardService.MonitorPrivateWireAsync(oldId, false);
                    await _lineRtpBridgeService.StopMonitorAsync(oldId);
                }
                catch (Exception ex) { _logger.LogWarning(ex, "Failed to auto-disable monitor for {LineId}", oldId); }
            }

            foreach (var id in desired)
            {
                if (_appliedMonitoredLineIds.Contains(id)) continue;
                try
                {
                    var result = await _dealerboardService.MonitorPrivateWireAsync(id, true);
                    await StartMonitorMediaAsync(id, result.MediaGroupId);
                }
                catch (Exception ex) { _logger.LogWarning(ex, "Failed to auto-enable monitor for {LineId}", id); }
            }

            _appliedMonitoredLineIds = desired;
            _desiredMonitoredLineIds = desired;
            RefreshMonitoredLinesPanel();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SyncMonitorsFromPreferenceAsync failed");
        }
    }

    private void RebuildLineIdButtonIndex()
    {
        _lineIdToButtonLocation.Clear();
        if (_dealerboardConfig.Assignments == null) return;

        foreach (var pageEntry in _dealerboardConfig.Assignments)
        {
            var pageNumber = pageEntry.Key;
            var buttons = pageEntry.Value;
            if (buttons == null) continue;

            foreach (var buttonEntry in buttons)
            {
                var assignment = buttonEntry.Value;
                var lineId = assignment?.LineId ?? assignment?.DdiLineId;
                if (!string.IsNullOrWhiteSpace(lineId))
                {
                    _lineIdToButtonLocation[lineId] = (pageNumber, buttonEntry.Key);
                }
            }
        }
    }

    private bool TryGetButtonForLineId(string lineId, out int pageNumber, out int buttonNumber, out ButtonAssignment? assignment)
    {
        pageNumber = 0;
        buttonNumber = 0;
        assignment = null;

        if (string.IsNullOrWhiteSpace(lineId)) return false;
        if (!_lineIdToButtonLocation.TryGetValue(lineId, out var location)) return false;

        pageNumber = location.Page;
        buttonNumber = location.ButtonNumber;
        if (_dealerboardConfig.Assignments != null
            && _dealerboardConfig.Assignments.TryGetValue(pageNumber, out var page)
            && page != null)
        {
            page.TryGetValue(buttonNumber, out assignment);
        }

        return assignment != null;
    }

    private void NotifyRingingCountChanged()
    {
        OnPropertyChanged(nameof(GlobalRingingCount));
        OnPropertyChanged(nameof(HasRingingLines));
        OnPropertyChanged(nameof(CanEndLineCall));
    }

    private string? GetFirstRingingLineId()
    {
        if (_ringingLineIds.Count > 0)
        {
            return _ringingLineIds.First();
        }

        foreach (var key in _ringingKeys)
        {
            var parts = key.Split('-');
            if (parts.Length != 2) continue;
            if (!int.TryParse(parts[0], out var page) || !int.TryParse(parts[1], out var buttonNumber)) continue;
            if (_dealerboardConfig.Assignments != null
                && _dealerboardConfig.Assignments.TryGetValue(page, out var pageAssignments)
                && pageAssignments != null
                && pageAssignments.TryGetValue(buttonNumber, out var assignment))
            {
                var lineId = assignment?.LineId ?? assignment?.DdiLineId;
                if (!string.IsNullOrWhiteSpace(lineId)) return lineId;
            }
        }

        return null;
    }

    private void ApplyCurrentPageToButtons()
    {
        Dictionary<int, ButtonAssignment> pageAssignments = new();
        if (_dealerboardConfig.Assignments != null && _dealerboardConfig.Assignments.TryGetValue(CurrentPage, out var page) && page != null)
        {
            pageAssignments = page;
        }

        foreach (var btn in Buttons)
        {
            btn.SetPageNumber(CurrentPage);
            pageAssignments.TryGetValue(btn.ButtonNumber, out var assignment);

            var display = ResolveDisplayLabel(assignment);
            var sub = ResolveSubLabel(assignment);
            btn.Apply(assignment, display, sub);

            if (assignment != null &&
                string.Equals(assignment.AssignmentType, "privateWire", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(assignment.LineId))
            {
                // Reflect persisted monitor preference on the UI.
                btn.IsMonitoring = _desiredMonitoredLineIds.Contains(assignment.LineId);
            }

            // Shared busy/ringing status (so other users see red/busy too)
            var assignedLineId = assignment?.LineId ?? assignment?.DdiLineId ?? assignment?.SpeedDialId ?? assignment?.BroadcastId;
            btn.IsRinging = _ringingKeys.Contains($"{CurrentPage}-{btn.ButtonNumber}")
                || (!string.IsNullOrWhiteSpace(assignedLineId) && _ringingLineIds.Contains(assignedLineId));
            if (!string.IsNullOrWhiteSpace(assignedLineId))
            {
                var localPrivate = ReferenceEquals(btn, _speakerActiveButton);
                btn.IsPrivate = _privateLineIds.Contains(assignedLineId) || localPrivate;
                btn.IsBusy = !btn.IsPrivate && _busyLineIds.Contains(assignedLineId);
                btn.IsDisconnected = !btn.IsPrivate
                    && !btn.IsBusy
                    && !btn.IsRinging
                    && _disconnectedLineIds.Contains(assignedLineId);
            }
            else
            {
                btn.IsPrivate = false;
                btn.IsBusy = false;
                btn.IsDisconnected = false;
            }
        }
    }

    private string ResolveDisplayLabel(ButtonAssignment? assignment)
    {
        if (assignment == null) return string.Empty;

        var type = assignment.AssignmentType ?? string.Empty;

        // Per-button label override (Admin Portal stores this in assignment.metadata for speed dials)
        try
        {
            static string? TryGetLabelFromJsonObject(System.Text.Json.JsonElement obj)
            {
                if (obj.ValueKind != System.Text.Json.JsonValueKind.Object) return null;

                if (obj.TryGetProperty("label", out var labelProp))
                {
                    var label = labelProp.GetString();
                    if (!string.IsNullOrWhiteSpace(label)) return label;
                }

                if (obj.TryGetProperty("buttonLabel", out var buttonLabelProp))
                {
                    var label = buttonLabelProp.GetString();
                    if (!string.IsNullOrWhiteSpace(label)) return label;
                }

                return null;
            }

            // Most commonly metadata is a JSON object. In some environments it can arrive as a JSON string;
            // support both so per-button labels always render (especially for speed dials).
            var meta = assignment.Metadata;
            var direct = TryGetLabelFromJsonObject(meta);
            if (!string.IsNullOrWhiteSpace(direct)) return direct;

            if (meta.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                var raw = meta.GetString();
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(raw);
                    var parsed = TryGetLabelFromJsonObject(doc.RootElement);
                    if (!string.IsNullOrWhiteSpace(parsed)) return parsed;
                }
            }
        }
        catch { }

        if (type.Equals("privateWire", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(assignment.LineId))
        {
            return _availableLines.FirstOrDefault(l => l.Id == assignment.LineId)?.Label
                   ?? _availableLines.FirstOrDefault(l => l.Id == assignment.LineId)?.Name
                   ?? assignment.LineId;
        }

        if (type.Equals("ddiLine", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(assignment.DdiLineId))
        {
            return _availableLines.FirstOrDefault(l => l.Id == assignment.DdiLineId)?.Label
                   ?? _availableLines.FirstOrDefault(l => l.Id == assignment.DdiLineId)?.Name
                   ?? assignment.DdiLineId;
        }

        if (type.Equals("speedDial", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(assignment.SpeedDialId))
        {
            return _speedDials.FirstOrDefault(s => s.Id == assignment.SpeedDialId)?.Name
                   ?? assignment.SpeedDialId;
        }

        if (type.Equals("broadcast", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(assignment.BroadcastId))
        {
            return _broadcasts.FirstOrDefault(b => b.Id == assignment.BroadcastId)?.Name
                   ?? assignment.BroadcastId;
        }

        if (type.Equals("viewingKey", StringComparison.OrdinalIgnoreCase) || type.Equals("viewRingLines", StringComparison.OrdinalIgnoreCase))
        {
            return "Soft Ring Key";
        }

        if (type.Equals("callForward", StringComparison.OrdinalIgnoreCase) || type.Equals("callForwardKey", StringComparison.OrdinalIgnoreCase))
        {
            return "Call Forward";
        }

        return assignment.Id;
    }

    private string ResolveSubLabel(ButtonAssignment? assignment)
    {
        if (assignment == null) return string.Empty;

        var type = assignment.AssignmentType ?? string.Empty;
        if (type.Equals("speedDial", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(assignment.SpeedDialId))
        {
            return _speedDials.FirstOrDefault(s => s.Id == assignment.SpeedDialId)?.Number
                   ?? string.Empty;
        }

        if (type.Equals("broadcast", StringComparison.OrdinalIgnoreCase))
        {
            return "BROADCAST";
        }

        if (type.Equals("privateWire", StringComparison.OrdinalIgnoreCase))
        {
            return "PRIVATE";
        }

        if (type.Equals("ddiLine", StringComparison.OrdinalIgnoreCase))
        {
            return "DDI";
        }

        return type;
    }

    [RelayCommand]
    private async Task ToggleMonitor(DealerboardButtonViewModel? button)
    {
        if (button?.Assignment?.LineId == null)
        {
            return;
        }

        try
        {
            var userId = _authService.CurrentUser?.Id;
            if (string.IsNullOrWhiteSpace(userId))
            {
                return;
            }

            var lineId = button.Assignment.LineId;
            var next = !button.IsMonitoring;

            if (next && !_desiredMonitoredLineIds.Contains(lineId) && _desiredMonitoredLineIds.Count >= MaxMonitors)
            {
                AddNotification(PackIconKind.AlertCircle, "Monitor limit", $"Max {MaxMonitors} monitored lines.");
                return;
            }

            MonitorLineResult result;
            if (next)
            {
                result = await _dealerboardService.MonitorPrivateWireAsync(lineId, true);
                await StartMonitorMediaAsync(lineId, result.MediaGroupId);
            }
            else
            {
                result = await _dealerboardService.MonitorPrivateWireAsync(lineId, false);
                await _lineRtpBridgeService.StopMonitorAsync(lineId);
            }

            button.IsMonitoring = next;

            if (next) _desiredMonitoredLineIds.Add(lineId);
            else _desiredMonitoredLineIds.Remove(lineId);

            // Keep applied set aligned (so reload doesn't flip unexpectedly).
            _appliedMonitoredLineIds = new HashSet<string>(_desiredMonitoredLineIds, StringComparer.OrdinalIgnoreCase);

            // Persist for restore across app restarts/machines.
            await _dealerboardService.SaveMonitoredLineIdsAsync(userId, _desiredMonitoredLineIds.Take(MaxMonitors).ToList());
            RefreshMonitoredLinesPanel();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ToggleMonitor failed");
        }
    }

    [RelayCommand]
    private async Task StopMonitor(MonitoredLineViewModel? item)
    {
        if (item == null || item.IsEmpty) return;

        var lineId = item.LineId;
        try
        {
            await _dealerboardService.MonitorPrivateWireAsync(lineId, false);
            await _lineRtpBridgeService.StopMonitorAsync(lineId);

            _desiredMonitoredLineIds.Remove(lineId);
            _appliedMonitoredLineIds.Remove(lineId);

            var userId = _authService.CurrentUser?.Id;
            if (!string.IsNullOrWhiteSpace(userId))
            {
                await _dealerboardService.SaveMonitoredLineIdsAsync(userId, _desiredMonitoredLineIds.Take(MaxMonitors).ToList());
            }

            foreach (var btn in Buttons)
            {
                if (string.Equals(btn.Assignment?.LineId, lineId, StringComparison.OrdinalIgnoreCase))
                {
                    btn.IsMonitoring = false;
                }
            }

            RefreshMonitoredLinesPanel();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "StopMonitor failed for {LineId}", lineId);
        }
    }

    private void RefreshMonitoredLinesPanel()
    {
        MonitoredLines.Clear();
        var ids = _desiredMonitoredLineIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxMonitors)
            .ToList();

        for (var slot = 0; slot < MaxMonitors; slot++)
        {
            if (slot < ids.Count)
            {
                var lineId = ids[slot];
                if (TryGetButtonForLineId(lineId, out var pageNumber, out var buttonNumber, out var assignment))
                {
                    MonitoredLines.Add(new MonitoredLineViewModel(
                        lineId,
                        ResolveDisplayLabel(assignment),
                        buttonNumber,
                        pageNumber));
                }
                else
                {
                    MonitoredLines.Add(new MonitoredLineViewModel(lineId, "Monitored line", 0, slot + 1));
                }
            }
            else
            {
                MonitoredLines.Add(new MonitoredLineViewModel(string.Empty, "—", 0, 0));
            }
        }
    }

    private string ResolvePrivateWireMode(string lineId, ButtonAssignment? assignment)
    {
        var fromCatalog = _availableLines
            .FirstOrDefault(l => string.Equals(l.Id, lineId, StringComparison.OrdinalIgnoreCase))
            ?.Mode;
        if (!string.IsNullOrWhiteSpace(fromCatalog))
        {
            return fromCatalog.Trim().ToUpperInvariant();
        }

        try
        {
            if (assignment?.Metadata.ValueKind == System.Text.Json.JsonValueKind.Object)
            {
                if (assignment.Metadata.TryGetProperty("mode", out var modeProp))
                {
                    var mode = modeProp.GetString();
                    if (!string.IsNullOrWhiteSpace(mode)) return mode.Trim().ToUpperInvariant();
                }
                if (assignment.Metadata.TryGetProperty("lineMode", out var lineModeProp))
                {
                    var mode = lineModeProp.GetString();
                    if (!string.IsNullOrWhiteSpace(mode)) return mode.Trim().ToUpperInvariant();
                }
            }
        }
        catch { }

        return "ARD";
    }

    private void SetLineCallBanner(string label, bool ringing)
    {
        _callStartTimeUtc = DateTime.UtcNow;
        CallBannerBrush = ringing
            ? new SolidColorBrush(Color.FromRgb(0xf5, 0x9e, 0x0b)) // amber
            : new SolidColorBrush(Color.FromRgb(0x16, 0xa3, 0x4a)); // green
        SetCallStatusSafe(ringing ? $"Ringing (Line) — {label}" : $"Connected (Line) — {label}");
        StartCallDurationTimer();
    }

    [RelayCommand]
    private async Task LinePressed(DealerboardButtonViewModel? button)
    {
        if (button == null)
        {
            return;
        }

        SelectedLineLabel = button.DisplayLabel;

        var assignment = button.Assignment;
        if (assignment == null)
        {
            return;
        }

        var type = (assignment.AssignmentType ?? string.Empty).Trim();
        var privateWireId = assignment.LineId;
        var ddiLineId = assignment.DdiLineId;
        var lineId = !string.IsNullOrWhiteSpace(privateWireId) ? privateWireId : ddiLineId;

        if (string.IsNullOrWhiteSpace(lineId))
        {
            return;
        }

        try
        {
            if (TransferMode && HasActiveLineCall)
            {
                var sourceLineId = GetActiveSourceLineId();
                if (string.IsNullOrWhiteSpace(sourceLineId))
                {
                    ClearLineOperationModes();
                    return;
                }

                if (string.Equals(sourceLineId, lineId, StringComparison.OrdinalIgnoreCase))
                {
                    AddNotification(PackIconKind.AlertCircle, "Transfer", "Select a different line for transfer.");
                    return;
                }

                try
                {
                    await _dealerboardService.TransferLineCallAsync(sourceLineId, lineId);
                    ClearLineOperationModes();
                    AddNotification(PackIconKind.PhoneForwarded, "Transfer", "Transfer initiated.");
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Line transfer failed");
                    ClearLineOperationModes();
                    AddNotification(PackIconKind.AlertCircle, "Transfer", ex.Message);
                }
                return;
            }

            if (ConferenceMode && HasActiveLineCall)
            {
                var sourceLineId = GetActiveSourceLineId();
                if (string.IsNullOrWhiteSpace(sourceLineId))
                {
                    ClearLineOperationModes();
                    return;
                }

                if (string.Equals(sourceLineId, lineId, StringComparison.OrdinalIgnoreCase))
                {
                    AddNotification(PackIconKind.AlertCircle, "Conference", "Select a different line to conference.");
                    return;
                }

                try
                {
                    await _dealerboardService.ConferenceLineCallAsync(sourceLineId, lineId);
                    ClearLineOperationModes();
                    AddNotification(PackIconKind.AccountGroup, "Conference", "Lines conferenced.");
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Line conference failed");
                    ClearLineOperationModes();
                    AddNotification(PackIconKind.AlertCircle, "Conference", ex.Message);
                }
                return;
            }

            var isOutboundActive = ReferenceEquals(_speakerActiveButton, button)
                && HasActiveLineCall
                && (button.IsPrivate || _privateLineIds.Contains(lineId));

            var isIncomingRing = button.IsRinging
                || _incomingSipCallIds.ContainsKey(lineId)
                || (_ringingLineIds.Contains(lineId) && !isOutboundActive);

            if (isIncomingRing && !isOutboundActive)
            {
                try
                {
                    await AnswerIncomingLineAsync(button, lineId);
                    return;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "AnswerIncomingLineAsync failed for {LineId}", lineId);
                    var msg = ex.Message ?? string.Empty;
                    if (msg.Contains("409", StringComparison.Ordinal)
                        || msg.Contains("Conflict", StringComparison.OrdinalIgnoreCase)
                        || msg.Contains("no longer ringing", StringComparison.OrdinalIgnoreCase))
                    {
                        try { await _dealerboardService.EndCallAsync(lineId); } catch { }
                        await ClearLocalLineCallStateAsync(lineId);
                    }
                    else
                    {
                        AddNotification(PackIconKind.AlertCircle, "Answer failed", ex.Message);
                        return;
                    }
                }
            }
            else if (button.IsRinging && !isIncomingRing)
            {
                _ringingLineIds.Remove(lineId);
                _ringingKeys.Remove($"{CurrentPage}-{button.ButtonNumber}");
                NotifyRingingCountChanged();
                ApplyCurrentPageToButtons();
                return;
            }

            // Toggle speaker session — end active line call on this button.
            if (ReferenceEquals(_speakerActiveButton, button) && (button.IsPrivate || _privateLineIds.Contains(lineId)))
            {
                await StopLineMediaAsync();
                try
                {
                    await _dealerboardService.EndCallAsync(lineId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "End call via line button failed for {LineId}", lineId);
                }
                await ClearLocalLineCallStateAsync(lineId);
                return;
            }

            // Ensure only one speaker-active line at a time
            if (_speakerActiveButton != null && _speakerActiveButton != button)
            {
                var prev = _speakerActiveButton.Assignment;
                var prevId = prev?.LineId ?? prev?.DdiLineId;
                if (!string.IsNullOrWhiteSpace(prevId))
                {
                    try
                    {
                        await StopLineMediaAsync();
                        await _dealerboardService.EndCallAsync(prevId);
                    }
                    catch { }
                }
                _speakerActiveButton.IsPrivate = false;
                StopArdRingtone();
            }

            // Private wire vs DDI behavior.
            if (!string.IsNullOrWhiteSpace(privateWireId))
            {
                if (_privateLineIds.Contains(privateWireId) && !ReferenceEquals(_speakerActiveButton, button))
                {
                    try { await _dealerboardService.EndCallAsync(privateWireId); } catch { }
                    await ClearLocalLineCallStateAsync(privateWireId);
                }

                var normalized = ResolvePrivateWireMode(privateWireId, assignment);
                var autoRing = normalized == "ARD";
                var hoot = normalized == "HOOT";

                if (autoRing) StartArdRingtone();
                else StopArdRingtone();

                button.IsPrivate = true;
                _speakerActiveButton = button;
                HasActiveLineCall = true;
                _privateLineIds.Add(privateWireId);
                OnPropertyChanged(nameof(IsAnyCallActive));

                if (!IsCallActive)
                {
                    SetLineCallBanner(button.DisplayLabel, ringing: autoRing);
                }

                try
                {
                    var callResult = await _dealerboardService.CallPrivateWireAsync(privateWireId, autoRing: autoRing, hoot: hoot);
                    if (string.IsNullOrWhiteSpace(callResult?.MediaGroupId))
                    {
                        throw new InvalidOperationException("Server did not return a media path for this line call.");
                    }

                    await StartLineMediaAsync(callResult);
                    if (!IsCallActive)
                    {
                        SetLineCallBanner(button.DisplayLabel, ringing: callResult.Ringing || autoRing);
                    }
                    ApplyCurrentPageToButtons();
                    AddNotification(
                        autoRing ? PackIconKind.Phone : PackIconKind.PhoneForwarded,
                        autoRing ? "Line ringing" : "Line connected",
                        autoRing
                            ? $"{button.DisplayLabel}: ringing far end"
                            : $"{button.DisplayLabel}: on line");
                }
                catch (Exception ex)
                {
                    var msg = ex.Message ?? string.Empty;
                    if (msg.Contains("409", StringComparison.Ordinal)
                        || msg.Contains("Conflict", StringComparison.OrdinalIgnoreCase))
                    {
                        try
                        {
                            await AnswerIncomingLineAsync(button, lineId);
                            return;
                        }
                        catch (Exception answerEx)
                        {
                            _logger.LogWarning(answerEx, "Call conflict fallback answer failed for {LineId}", lineId);
                        }
                    }

                    await StopLineMediaAsync();
                    button.IsPrivate = false;
                    if (_speakerActiveButton == button) _speakerActiveButton = null;
                    HasActiveLineCall = false;
                    _privateLineIds.Remove(privateWireId);
                    StopArdRingtone();
                    OnPropertyChanged(nameof(IsAnyCallActive));
                    if (!IsCallActive)
                    {
                        _callStartTimeUtc = null;
                        SetCallStatusSafe("Ready");
                    }
                    AddNotification(PackIconKind.AlertCircle, "Line call failed", ex.Message);
                    _logger.LogWarning(ex, "Private wire call failed for {LineId}", privateWireId);
                    return;
                }
            }
            else
            {
                // DDI: "dial tone line" selection + dialing.
                // If no digits are present, treat pressing the line as selecting the outbound line.
                // If digits are present, place the call using this line.
                StopArdRingtone();
                if (string.IsNullOrWhiteSpace(DialedDigits))
                {
                    _selectedOutboundDdiLineId = ddiLineId;
                    AddNotification(PackIconKind.Phone, "Dial tone selected", button.DisplayLabel);
                }
                else
                {
                    var digits = string.IsNullOrWhiteSpace(DialedDigits) ? null : DialedDigits;
                    var callResult = await _dealerboardService.CallDdiLineAsync(ddiLineId!, digits);
                    await StartLineMediaAsync(callResult);
                    _activeDialLineId = ddiLineId;
                }
            }
            // Only mark a "line call" active if we actually initiated a call (DDI only does when digits exist).
            if (string.IsNullOrWhiteSpace(privateWireId) && (!string.IsNullOrWhiteSpace(ddiLineId) && !string.IsNullOrWhiteSpace(DialedDigits)))
            {
                button.IsPrivate = true;
                _speakerActiveButton = button;
                HasActiveLineCall = true;
                OnPropertyChanged(nameof(IsAnyCallActive));
            }

            // For telephony, treat the line as "engaged/connected" when ringback/engage tone starts (i.e., when we initiate).
            if (!IsCallActive && HasActiveLineCall)
            {
                _callStartTimeUtc = DateTime.UtcNow;
                CallBannerBrush = new SolidColorBrush(Color.FromRgb(0x16, 0xa3, 0x4a)); // green
                SetCallStatusSafe($"Connected (Line) — {button.DisplayLabel}");
                StartCallDurationTimer();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "LinePressed failed");
            AddNotification(PackIconKind.AlertCircle, "Line button", ex.Message);
        }
    }

    private void StartArdRingtone(int maxSeconds = 8)
    {
        try
        {
            StopArdRingtone();

            // Keep it simple and reliable: use a system sound on a short interval.
            // Caller side rings briefly (8s); incoming side rings longer (see OnLineSipIncoming).
            _ardRingStopAt = DateTimeOffset.UtcNow.AddSeconds(maxSeconds);
            _ardRingTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(800) };
            _ardRingTimer.Tick += (_, __) =>
            {
                try
                {
                    if (_ardRingStopAt.HasValue && DateTimeOffset.UtcNow >= _ardRingStopAt.Value)
                    {
                        StopArdRingtone();
                        return;
                    }
                    SystemSounds.Asterisk.Play();
                }
                catch { }
            };
            _ardRingTimer.Start();
        }
        catch { }
    }

    private void StopArdRingtone()
    {
        try
        {
            if (_ardRingTimer != null)
            {
                _ardRingTimer.Stop();
                _ardRingTimer = null;
            }
            _ardRingStopAt = null;
        }
        catch { }
    }

    private async Task StartMonitorMediaAsync(string lineId, string? mediaGroupId)
    {
        var groupId = mediaGroupId;
        if (string.IsNullOrWhiteSpace(groupId))
        {
            groupId = $"dealerboard-line:{lineId}";
        }

        try
        {
            await _lineRtpBridgeService.StartMonitorAsync(lineId, groupId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to start monitor RTP for line {LineId}", lineId);
        }
    }

    private async Task AnswerIncomingLineAsync(DealerboardButtonViewModel button, string lineId)
    {
        _incomingSipCallIds.TryGetValue(lineId, out var sipCallId);

        button.IsPrivate = true;
        _speakerActiveButton = button;
        HasActiveLineCall = true;
        OnPropertyChanged(nameof(IsAnyCallActive));

        try
        {
            var callResult = await _dealerboardService.AnswerIncomingLineAsync(lineId, sipCallId);
            StopArdRingtone();
            await StartLineMediaAsync(callResult);
            _ringingLineIds.Remove(lineId);
            _incomingSipCallIds.Remove(lineId);
            if (TryGetButtonForLineId(lineId, out var pageNumber, out var buttonNumber, out _))
            {
                _ringingKeys.Remove($"{pageNumber}-{buttonNumber}");
            }
            NotifyRingingCountChanged();
            _privateLineIds.Add(lineId);
            ApplyCurrentPageToButtons();
            SetLineCallBanner(button.DisplayLabel, ringing: false);
            AddNotification(PackIconKind.Phone, "Incoming answered", button.DisplayLabel);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AnswerIncomingLineAsync failed for {LineId}", lineId);
            button.IsPrivate = false;
            if (_speakerActiveButton == button) _speakerActiveButton = null;
            HasActiveLineCall = false;
            OnPropertyChanged(nameof(IsAnyCallActive));
            throw;
        }
    }

    private async Task StartLineMediaAsync(LineCallResult? callResult)
    {
        var mediaGroupId = callResult?.MediaGroupId;
        if (string.IsNullOrWhiteSpace(mediaGroupId))
        {
            _logger.LogWarning("Line call succeeded but no mediaGroupId returned — audio path unavailable");
            return;
        }

        try
        {
            await _lineRtpBridgeService.StartLineCallAsync(mediaGroupId);
            _activeLineMediaGroupId = mediaGroupId;
            _logger.LogInformation(
                "Line RTP media started. mediaGroupId={MediaGroupId} joinedExisting={JoinedExisting}",
                mediaGroupId,
                callResult?.JoinedExistingCall == true);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to start line RTP media for {MediaGroupId}", mediaGroupId);
            throw;
        }
    }

    private async Task StopLineMediaAsync()
    {
        _activeLineMediaGroupId = null;
        try
        {
            await _lineRtpBridgeService.StopAsync();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to stop line RTP media");
        }
    }

    [RelayCommand]
    private async Task EndLineCall()
    {
        try
        {
            ClearLineOperationModes();
            DialedDigits = string.Empty;

            var lineId = GetActiveSourceLineId();
            if (string.IsNullOrWhiteSpace(lineId))
            {
                await ClearLocalLineCallStateAsync(null);
                return;
            }

            await StopLineMediaAsync();
            await _dealerboardService.EndCallAsync(lineId);
            await ClearLocalLineCallStateAsync(lineId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "EndLineCall failed");
            AddNotification(PackIconKind.AlertCircle, "End call", ex.Message);
        }
    }

    private async Task ClearLocalLineCallStateAsync(string? lineId)
    {
        if (!string.IsNullOrWhiteSpace(lineId))
        {
            _privateLineIds.Remove(lineId);
            _ringingLineIds.Remove(lineId);
            _incomingSipCallIds.Remove(lineId);
            if (TryGetButtonForLineId(lineId, out var pageNumber, out var buttonNumber, out _))
            {
                _ringingKeys.Remove($"{pageNumber}-{buttonNumber}");
            }
        }
        else
        {
            _privateLineIds.Clear();
            _ringingLineIds.Clear();
            _ringingKeys.Clear();
            _incomingSipCallIds.Clear();
        }

        if (_speakerActiveButton != null)
        {
            var activeId = _speakerActiveButton.Assignment?.LineId ?? _speakerActiveButton.Assignment?.DdiLineId;
            if (string.IsNullOrWhiteSpace(lineId)
                || string.Equals(activeId, lineId, StringComparison.OrdinalIgnoreCase))
            {
                _speakerActiveButton.IsPrivate = false;
                _speakerActiveButton = null;
            }
        }

        _activeDialLineId = null;
        _activeLineMediaGroupId = null;
        HasActiveLineCall = _privateLineIds.Count > 0;
        StopArdRingtone();
        NotifyRingingCountChanged();
        OnPropertyChanged(nameof(IsAnyCallActive));
        OnPropertyChanged(nameof(CanEndLineCall));
        ApplyCurrentPageToButtons();

        if (!IsCallActive && !HasActiveLineCall)
        {
            SetCallStatusSafe(string.Empty);
            CallDuration = string.Empty;
            UpdateCallBannerBrush(null);
            StopCallDurationTimer();
        }

        await Task.CompletedTask;
    }

    [RelayCommand]
    private async Task AnswerNextRingingLine()
    {
        var lineId = GetFirstRingingLineId();
        if (string.IsNullOrWhiteSpace(lineId))
        {
            AddNotification(PackIconKind.AlertCircle, "Incoming call", "No ringing lines.");
            return;
        }

        if (!TryGetButtonForLineId(lineId, out var pageNumber, out var buttonNumber, out var assignment))
        {
            AddNotification(PackIconKind.AlertCircle, "Incoming call", "Ringing line is not assigned on your dealerboard.");
            return;
        }

        if (pageNumber != CurrentPage)
        {
            CurrentPage = pageNumber;
            ApplyCurrentPageToButtons();
        }

        var button = Buttons.FirstOrDefault(b => b.ButtonNumber == buttonNumber);
        if (button == null)
        {
            AddNotification(PackIconKind.AlertCircle, "Incoming call", "Could not locate dealerboard button.");
            return;
        }

        await AnswerIncomingLineAsync(button, lineId);
    }

    [RelayCommand]
    private async Task TransferLine()
    {
        var sourceLineId = GetActiveSourceLineId();
        if (string.IsNullOrWhiteSpace(sourceLineId) || !HasActiveLineCall)
        {
            AddNotification(PackIconKind.AlertCircle, "Transfer", "Select an active line first.");
            return;
        }

        if (!string.IsNullOrWhiteSpace(DialedDigits))
        {
            try
            {
                await _dealerboardService.TransferLineCallAsync(sourceLineId, digits: DialedDigits);
                DialedDigits = string.Empty;
                ClearLineOperationModes();
                AddNotification(PackIconKind.PhoneForwarded, "Transfer", "Transfer initiated.");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Blind transfer failed");
                AddNotification(PackIconKind.AlertCircle, "Transfer", ex.Message);
            }
            return;
        }

        ConferenceMode = false;
        TransferMode = true;
        AddNotification(PackIconKind.PhoneForwarded, "Transfer", "Select target line for transfer.");
    }

    [RelayCommand]
    private async Task ConferenceLine()
    {
        var sourceLineId = GetActiveSourceLineId();
        if (string.IsNullOrWhiteSpace(sourceLineId) || !HasActiveLineCall)
        {
            AddNotification(PackIconKind.AlertCircle, "Conference", "Select an active line first.");
            return;
        }

        TransferMode = false;
        ConferenceMode = true;
        AddNotification(PackIconKind.AccountGroup, "Conference", "Select another line to conference.");
        await Task.CompletedTask;
    }

    [RelayCommand]
    private async Task SignalLine()
    {
        try
        {
            var lineId = _speakerActiveButton?.Assignment?.LineId;
            if (string.IsNullOrWhiteSpace(lineId))
            {
                return;
            }

            var normalized = ResolvePrivateWireMode(lineId, _speakerActiveButton?.Assignment);

            if (normalized != "MRD")
            {
                AddNotification(PackIconKind.AlertCircle, "Signal", "Signal is only used for MRD lines.");
                return;
            }

            await _dealerboardService.SignalPrivateWireAsync(lineId);
            AddNotification(PackIconKind.Bell, "Signal", "Ringing signal sent.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SignalLine failed");
            AddNotification(PackIconKind.AlertCircle, "Signal", "Failed to send signal.");
        }
    }

    private string? GetActiveSourceLineId()
    {
        var fromSpeaker = _speakerActiveButton?.Assignment?.LineId
                          ?? _speakerActiveButton?.Assignment?.DdiLineId;
        if (!string.IsNullOrWhiteSpace(fromSpeaker))
        {
            return fromSpeaker;
        }

        if (!string.IsNullOrWhiteSpace(_activeDialLineId))
        {
            return _activeDialLineId;
        }

        if (_privateLineIds.Count > 0)
        {
            return _privateLineIds.First();
        }

        return null;
    }

    private void ClearLineOperationModes()
    {
        TransferMode = false;
        ConferenceMode = false;
    }

    [RelayCommand]
    private void DialDigit(string digit)
    {
        if (string.IsNullOrEmpty(digit))
        {
            return;
        }

        DialedDigits = (DialedDigits ?? string.Empty) + digit;
    }

    [RelayCommand]
    private void PrevPage()
    {
        CurrentPage = CurrentPage <= 1 ? MaxPages : (CurrentPage - 1);
        ApplyCurrentPageToButtons();
    }

    [RelayCommand]
    private void NextPage()
    {
        CurrentPage = CurrentPage >= MaxPages ? 1 : (CurrentPage + 1);
        ApplyCurrentPageToButtons();
    }

    [RelayCommand]
    private async Task RefreshDealerboard()
    {
        try
        {
            await ReloadDealerboardAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "RefreshDealerboard failed");
        }
    }

    private void OnConnectionStateChanged(object? sender, bool isConnected)
    {
        _logger.LogInformation("MainViewModel: OnConnectionStateChanged called with IsConnected={IsConnected}", isConnected);
        IsConnected = isConnected;
        UpdateConnectionStatus();
        _logger.LogInformation("MainViewModel: Connection status updated to {Status}", ConnectionStatus);
    }

    private void UpdateConnectionStatus()
    {
        ConnectionStatus = IsConnected ? "Connected" : "Disconnected";
        _logger.LogDebug("MainViewModel: UpdateConnectionStatus - Status={Status}, IsConnected={IsConnected}", ConnectionStatus, IsConnected);
    }

    [RelayCommand]
    private void Logout()
    {
        _logger.LogInformation("MainViewModel: Logout command executed");
        try
        {
            _logger.LogInformation("MainViewModel: Logging out user {Username}", CurrentUsername);
            _ = _authService.LogoutAsync();
            _logger.LogInformation("MainViewModel: AuthService.LogoutAsync() started");
            LogoutRequested?.Invoke(this, EventArgs.Empty);
            _logger.LogInformation("MainViewModel: LogoutRequested event fired");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MainViewModel: Error during logout");
            throw;
        }
    }

    [RelayCommand]
    private void OpenSettings()
    {
        try
        {
            var settingsWindow = App.GetService<Views.SettingsWindow>();
            settingsWindow.Owner = System.Windows.Application.Current.MainWindow;
            settingsWindow.WindowStartupLocation = System.Windows.WindowStartupLocation.CenterOwner;
            settingsWindow.ShowDialog();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MainViewModel: Failed to open settings window");
            System.Windows.MessageBox.Show(
                $"Failed to open settings: {ex.Message}",
                "Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
    }

    [RelayCommand]
    private async Task RetryConnection()
    {
        try
        {
            var token = _authService.AuthToken;
            var user = _authService.CurrentUser;
            var serverUrl = _configService.ServerUrl;

            if (string.IsNullOrWhiteSpace(serverUrl))
            {
                AddNotification(PackIconKind.AlertCircle, "Retry", "No server URL configured.");
                return;
            }

            if (string.IsNullOrWhiteSpace(token) || user == null)
            {
                AddNotification(PackIconKind.AlertCircle, "Retry", "Not authenticated. Please log out and log back in.");
                return;
            }

            ConnectionStatus = "Reconnecting...";

            try { await _socketService.DisconnectAsync(); } catch { }
            await _socketService.ConnectAsync(serverUrl, token);
            await _socketService.AuthenticateAsync(user.Id, user.Username, token);

            AddNotification(PackIconKind.CheckCircle, "Retry", "Reconnected.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "RetryConnection failed");
            AddNotification(PackIconKind.AlertCircle, "Retry", "Reconnect failed.");
            UpdateConnectionStatus();
        }
    }
}

