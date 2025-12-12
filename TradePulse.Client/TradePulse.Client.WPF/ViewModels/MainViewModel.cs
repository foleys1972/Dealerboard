using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;
using TradePulse.Client.Core.Services;
using TradePulse.Client.WPF.Views;

namespace TradePulse.Client.WPF.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly ILogger<MainViewModel> _logger;
    private readonly IAuthService _authService;
    private readonly ICallService _callService;
    private readonly ISocketService _socketService;
    private readonly IUserService _userService;
    private readonly IGroupService _groupService;
    private readonly IConfigurationService _configService;

    [ObservableProperty]
    private User? _currentUser;

    [ObservableProperty]
    private bool _isConnected;

    [ObservableProperty]
    private string _connectionStatus = "Disconnected";

    [ObservableProperty]
    private Call? _currentCall;

    [ObservableProperty]
    private ObservableCollection<ContactViewModel> _contacts = new();

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
    private string _callStatus = string.Empty;

    [ObservableProperty]
    private bool _isBroadcastMonitoring = false;

    [ObservableProperty]
    private ObservableCollection<BroadcastViewModel> _broadcasts = new();

    [ObservableProperty]
    private ObservableCollection<Group> _groupCalls = new();

    [ObservableProperty]
    private ObservableCollection<DirectContactViewModel> _directContacts = new();

    [ObservableProperty]
    private string _callDuration = string.Empty;

    private System.Timers.Timer? _callDurationTimer;

    public int ActiveBroadcastCount => Broadcasts.Count(b => b.IsActive);

    public bool IsInCall => CurrentCall != null && CurrentCall.State == CallState.Connected;

    public bool ShowIntercomDisabledWarning => CurrentUser != null && !CurrentUser.IntercomEnabled && CurrentUser.Role != "admin";

    public bool ShowContactsList => CurrentUser != null && (CurrentUser.IntercomEnabled || CurrentUser.Role == "admin");

    partial void OnCurrentCallChanged(Call? value)
    {
        OnPropertyChanged(nameof(IsInCall));
        
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
        IUserService userService,
        IGroupService groupService,
        IConfigurationService configService)
    {
        _logger = logger;
        _authService = authService;
        _callService = callService;
        _socketService = socketService;
        _userService = userService;
        _groupService = groupService;
        _configService = configService;

        CurrentUser = _authService.CurrentUser;
        IsConnected = _socketService.IsConnected;
        ConnectionStatus = IsConnected ? "Connected" : "Disconnected";

        // Subscribe to events
        _authService.UserAuthenticated += OnUserAuthenticated;
        _authService.UserLoggedOut += OnUserLoggedOut;
        _socketService.ConnectionStateChanged += OnConnectionStateChanged;
        _socketService.UserStatusChanged += OnUserStatusChanged;
        _callService.CallStarted += OnCallStarted;
        _callService.CallStateChanged += OnCallStateChanged;
        _callService.CallEnded += OnCallEnded;

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
            if (CurrentUser != null && !CurrentUser.IntercomEnabled && CurrentUser.Role != "admin")
            {
                _logger.LogWarning("Current user does not have intercom enabled. Contacts will not be loaded.");
                Contacts.Clear();
                return;
            }
            
            var users = await _userService.GetContactsAsync();
            
            Contacts.Clear();
            foreach (var user in users)
            {
                // Only show users that have intercom enabled (for intercom mode)
                // Admins can see all users
                if (user.IntercomEnabled || CurrentUser?.Role == "admin")
                {
                    Contacts.Add(new ContactViewModel
                    {
                        Id = user.Id,
                        Name = user.DisplayName ?? user.Username,
                        Status = user.Status ?? "offline"
                    });
                }
            }
            
            _logger.LogInformation("Loaded {Count} contacts", Contacts.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load contacts");
        }
    }

    private void OnUserStatusChanged(object? sender, User user)
    {
        // Update contact status if in list
        var contact = Contacts.FirstOrDefault(c => c.Id == user.Id);
        if (contact != null)
        {
            contact.Status = user.Status ?? "offline";
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
            var mainWindow = System.Windows.Application.Current.MainWindow;
            
            // Only set owner if it's different from the settings window
            if (mainWindow != null && mainWindow != settingsWindow)
            {
                settingsWindow.Owner = mainWindow;
                settingsWindow.WindowStartupLocation = System.Windows.WindowStartupLocation.CenterOwner;
            }
            else
            {
                settingsWindow.WindowStartupLocation = System.Windows.WindowStartupLocation.CenterScreen;
            }
            
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
        
        IsConnected = isAuthenticated;
        ConnectionStatus = isAuthenticated ? "Connected" : "Disconnected";
        
        if (CurrentUser != null)
        {
            CurrentUser.Status = isAuthenticated ? "online" : "offline";
            CurrentUser.IsOnline = isAuthenticated;
        }
        
        // Force property change notifications
        OnPropertyChanged(nameof(ConnectionStatus));
        OnPropertyChanged(nameof(IsConnected));
        OnPropertyChanged(nameof(CurrentUser));
        
        _logger.LogInformation("Connection status updated: {ConnectionStatus}, IsConnected: {IsConnected}, User.Status: {UserStatus}", 
            ConnectionStatus, IsConnected, CurrentUser?.Status ?? "null");
        
        // Wait a moment for socket to connect (optional) and ensure auth token is fully available
        await Task.Delay(500);
        
        // Check socket status (optional - HTTP auth is primary) and update if needed
        var socketConnected = _socketService.IsConnected;
        if (!socketConnected && isAuthenticated)
        {
            _logger.LogWarning("Socket.IO connection failed, but HTTP authentication succeeded. App will function in limited mode.");
            ConnectionStatus = "Connected (Socket.IO unavailable)";
            OnPropertyChanged(nameof(ConnectionStatus));
        }
        
        // Reload contacts after authentication - ensure token is available first
        _logger.LogInformation("Loading contacts after authentication - AuthToken available: {HasToken}, Token length: {TokenLength}", 
            !string.IsNullOrEmpty(_authService.AuthToken), _authService.AuthToken?.Length ?? 0);
        await LoadContactsAsync();
        
        // Load user groups
        await LoadGroupsAsync();
        
        // Load broadcasts, group calls, and direct contacts
        await LoadBroadcastsAsync();
        await LoadGroupCallsAsync();
        await LoadDirectContactsAsync();
        
        _logger.LogInformation("=== OnUserAuthenticated completed for user: {Username}, IsConnected: {IsConnected}, ConnectionStatus: {ConnectionStatus} ===", 
            user.Username, IsConnected, ConnectionStatus);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception in OnUserAuthenticated: {Message}", ex.Message);
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
        
        // Always prioritize HTTP authentication status over Socket.IO
        // Socket.IO is optional for basic functionality (contacts, calls work via HTTP/API)
        if (isAuthenticated)
        {
            // We're authenticated - show as connected
            IsConnected = true;
            if (isConnected)
            {
                ConnectionStatus = "Connected";
            }
            else
            {
                // Authenticated but Socket.IO not connected - still show connected with note
                ConnectionStatus = "Connected (Socket.IO unavailable)";
                _logger.LogInformation("Socket.IO connection lost, but HTTP authentication is active. App will continue with HTTP API.");
            }
        }
        else
        {
            // Not authenticated at all - show disconnected
            IsConnected = false;
            ConnectionStatus = "Disconnected";
        }
        
        // Update current user status if available
        if (CurrentUser != null)
        {
            CurrentUser.Status = IsConnected ? "online" : "offline";
            CurrentUser.IsOnline = IsConnected;
            _logger.LogInformation("Updated current user status to: {Status}, IsConnected: {IsConnected}", CurrentUser.Status, IsConnected);
        }
        
        OnPropertyChanged(nameof(ConnectionStatus));
        OnPropertyChanged(nameof(IsConnected));
        _logger.LogInformation("Connection status updated in UI: {ConnectionStatus}, IsConnected: {IsConnected}", ConnectionStatus, IsConnected);
    }

    private void OnCallStarted(object? sender, Call call)
    {
        CurrentCall = call;
        CallStatus = $"Calling {call.TargetName ?? call.TargetId}...";
        OnPropertyChanged(nameof(IsInCall));
    }

    private void OnCallStateChanged(object? sender, Call call)
    {
        CurrentCall = call;
        
        switch (call.State)
        {
            case CallState.Connected:
                CallStatus = $"Connected to {call.TargetName ?? call.TargetId}";
                break;
            case CallState.Ended:
                CallStatus = "Call ended";
                CurrentCall = null;
                break;
        }
        
        OnPropertyChanged(nameof(IsInCall));
    }

    private void OnCallEnded(object? sender, string callId)
    {
        CurrentCall = null;
        CallStatus = string.Empty;
        CallDuration = string.Empty;
        _callDurationTimer?.Stop();
        OnPropertyChanged(nameof(IsInCall));
    }

    private async Task LoadBroadcastsAsync()
    {
        try
        {
            _logger.LogInformation("Loading broadcasts...");
            // TODO: Implement API call to get broadcasts
            // For now, filter groups by callMode = 'broadcast'
            var allGroups = await _groupService.GetUserGroupsAsync();
            var broadcastGroups = allGroups.Where(g => g.CallMode == CallMode.Conference).ToList(); // Temporary filter
            
            Broadcasts.Clear();
            foreach (var group in broadcastGroups)
            {
                Broadcasts.Add(new BroadcastViewModel
                {
                    Id = group.Id,
                    Name = group.Name,
                    IsActive = false,
                    ListenerCount = 0
                });
            }
            
            _logger.LogInformation("Loaded {Count} broadcasts", Broadcasts.Count);
            OnPropertyChanged(nameof(ActiveBroadcastCount));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load broadcasts");
        }
    }

    private async Task LoadGroupCallsAsync()
    {
        try
        {
            _logger.LogInformation("Loading group calls...");
            var allGroups = await _groupService.GetUserGroupsAsync();
            // Filter out broadcasts - only show groups that are for group calls
            var groupCallGroups = allGroups.Where(g => g.CallMode != CallMode.Conference || string.IsNullOrEmpty(g.Description)).ToList();
            
            GroupCalls.Clear();
            foreach (var group in groupCallGroups)
            {
                GroupCalls.Add(group);
            }
            
            _logger.LogInformation("Loaded {Count} group calls", GroupCalls.Count);
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
            _logger.LogInformation("Loading direct contacts...");
            // TODO: Implement API call to /api/direct-contacts
            // For now, use regular contacts
            var users = await _userService.GetContactsAsync();
            
            DirectContacts.Clear();
            foreach (var user in users)
            {
                if (user.IntercomEnabled || CurrentUser?.Role == "admin")
                {
                    DirectContacts.Add(new DirectContactViewModel
                    {
                        Id = user.Id,
                        Name = user.DisplayName ?? user.Username,
                        Status = user.Status ?? "offline"
                    });
                }
            }
            
            _logger.LogInformation("Loaded {Count} direct contacts", DirectContacts.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load direct contacts");
        }
    }

    [RelayCommand]
    private async void ToggleBroadcastMonitorForItem(BroadcastViewModel? broadcast)
    {
        if (broadcast == null) return;

        try
        {
            broadcast.IsActive = !broadcast.IsActive;
            // TODO: Implement API call to toggle broadcast monitor
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
            // TODO: Implement PTT for broadcast
            _logger.LogInformation("Starting PTT for broadcast: {BroadcastId}", broadcast.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start broadcast PTT");
        }
    }

    [RelayCommand]
    private async void StartGroupCallFromGrid(Group? group)
    {
        if (group == null) return;

        try
        {
            await _callService.StartGroupCallAsync(group.Id, CallType.Conference);
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
            await _callService.StartCallAsync(contact.Id, CallType.Direct);
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
            // TODO: Implement video call support
            await _callService.StartCallAsync(contact.Id, CallType.Direct);
            _logger.LogInformation("Starting video call to: {ContactId}", contact.Id);
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
        // TODO: Open add contact dialog
        _logger.LogInformation("Add contact command triggered");
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
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = "Offline";
    public bool IsFavorite { get; set; } = false;
}

public class BroadcastViewModel
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public int ListenerCount { get; set; }
}

public class DirectContactViewModel
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = "offline";
}

