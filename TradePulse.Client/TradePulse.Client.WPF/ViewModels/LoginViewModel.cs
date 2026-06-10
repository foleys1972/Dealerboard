using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Services;

namespace TradePulse.Client.WPF.ViewModels;

public partial class LoginViewModel : ObservableObject
{
    private readonly ILogger<LoginViewModel> _logger;
    private readonly IAuthService _authService;
    private readonly ISocketService _socketService;
    private readonly IConfigurationService _configService;

    [ObservableProperty]
    private string _username = string.Empty;

    [ObservableProperty]
    private string _password = string.Empty;

    [ObservableProperty]
    private string _serverUrl = string.Empty;

    [ObservableProperty]
    private string _errorMessage = string.Empty;

    [ObservableProperty]
    private string _statusMessage = string.Empty;

    [ObservableProperty]
    private bool _isLoading = false;

    public bool HasError => !string.IsNullOrEmpty(ErrorMessage);

    public event EventHandler? LoginSuccessful;

    public LoginViewModel(
        ILogger<LoginViewModel> logger,
        IAuthService authService,
        ISocketService socketService,
        IConfigurationService configService)
    {
        _logger = logger;
        _authService = authService;
        _socketService = socketService;
        _configService = configService;
        
        // Load server URL and last username from configuration
        _serverUrl = ServerUrlHelper.Normalize(_configService.ServerUrl);
        _username = _configService.LastUsername;
    }

    partial void OnServerUrlChanged(string value)
    {
        // Don't save on every keystroke - only update the property
        // Configuration will be saved when login is attempted
    }

    [RelayCommand]
    private async void TestConnection()
    {
        if (string.IsNullOrWhiteSpace(ServerUrl))
        {
            ErrorMessage = "Please enter a server URL";
            return;
        }

        if (!ServerUrlHelper.TryNormalize(ServerUrl, out var normalizedUrl, out var urlError))
        {
            ErrorMessage = urlError;
            return;
        }

        ServerUrl = normalizedUrl;
        IsLoading = true;
        ErrorMessage = string.Empty;
        StatusMessage = "Testing connection...";

        try
        {
            using var httpClient = new HttpClient(new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
            })
            {
                Timeout = TimeSpan.FromSeconds(5),
                BaseAddress = new Uri(normalizedUrl)
            };

            // Try to connect to the server - test with a simple endpoint
            // If /api/health doesn't exist, try the root or /api/auth/login (which should exist)
            HttpResponseMessage? response = null;
            try
            {
                response = await httpClient.GetAsync("/api/health");
            }
            catch
            {
                // If /api/health doesn't exist, try root
                try
                {
                    response = await httpClient.GetAsync("/");
                }
                catch
                {
                    // If that fails, just try to connect (any response means server is reachable)
                    response = await httpClient.GetAsync("/api/auth/login");
                }
            }

            if (response != null)
            {
                // Any response (even 404 or 405) means server is reachable
                StatusMessage = $"Connection successful! Server responded with: {response.StatusCode}";
                ErrorMessage = string.Empty;
            }
        }
        catch (Exception ex)
        {
            var errorMsg = ex.Message;
            if (ex.InnerException != null)
            {
                errorMsg += $" ({ex.InnerException.Message})";
            }

            if (errorMsg.Contains("SSL") || errorMsg.Contains("certificate"))
            {
                ErrorMessage = "SSL certificate error. The server may be using a self-signed certificate.";
            }
            else if (errorMsg.Contains("refused") || errorMsg.Contains("timeout"))
            {
                ErrorMessage = $"Cannot connect to {ServerUrl}. Please check:\n1. Server is running\n2. URL is correct\n3. Firewall allows connection";
            }
            else
            {
                ErrorMessage = $"Connection test failed: {errorMsg}";
            }
            StatusMessage = string.Empty;
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async void Login()
    {
        if (string.IsNullOrWhiteSpace(Username) || string.IsNullOrWhiteSpace(Password))
        {
            ErrorMessage = "Please enter username and password";
            return;
        }

        if (string.IsNullOrWhiteSpace(ServerUrl))
        {
            ErrorMessage = "Please enter a server URL";
            return;
        }

        IsLoading = true;
        ErrorMessage = string.Empty;
        StatusMessage = "Connecting...";

        try
        {
            if (!ServerUrlHelper.TryNormalize(ServerUrl, out var normalizedUrl, out var urlError))
            {
                ErrorMessage = urlError;
                return;
            }

            ServerUrl = normalizedUrl;
            _configService.ServerUrl = ServerUrl;
            _configService.LastUsername = Username;
            _configService.Save();
            
            _authService.UpdateBaseAddress(ServerUrl);

            StatusMessage = "Connecting to server...";
            
            var success = await _authService.LoginAsync(Username, Password);

            if (success)
            {
                _logger.LogInformation("LoginAsync returned true - login successful");
                StatusMessage = "Login successful!";
                // Save username after successful login
                _configService.LastUsername = Username;
                _configService.Save();
                await Task.Delay(500); // Brief delay to show success message
                
                _logger.LogInformation("Invoking LoginSuccessful event");
                try
                {
                    LoginSuccessful?.Invoke(this, EventArgs.Empty);
                    _logger.LogInformation("LoginSuccessful event invoked successfully");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error invoking LoginSuccessful event: {Message}", ex.Message);
                    ErrorMessage = $"Login succeeded but failed to open main window: {ex.Message}";
                }
            }
            else
            {
                _logger.LogWarning("LoginAsync returned false - login failed");
                ErrorMessage = "Invalid username or password. Please check your credentials.";
                StatusMessage = string.Empty;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login error: {Message}", ex.Message);
            
            // Provide more user-friendly error messages
            var errorMsg = ex.Message;
            if (ex.InnerException != null)
            {
                errorMsg += $" ({ex.InnerException.Message})";
            }
            
            // Check for common connection errors
            if (errorMsg.Contains("SSL") || errorMsg.Contains("certificate") || errorMsg.Contains("TLS"))
            {
                ErrorMessage = "SSL certificate error. Please ensure the server certificate is trusted or use HTTP.";
            }
            else if (errorMsg.Contains("refused") || errorMsg.Contains("timeout") || errorMsg.Contains("unreachable") || errorMsg.Contains("No connection"))
            {
                ErrorMessage = $"Cannot connect to server at {ServerUrl}.\n\nPlease check:\n1. Server is running\n2. URL is correct (https://192.168.1.41:5000)\n3. Firewall allows connection\n4. Try the 'Test Connection' button";
            }
            else if (errorMsg.Contains("404") || errorMsg.Contains("Not Found"))
            {
                ErrorMessage = $"Server endpoint not found at {ServerUrl}.\nPlease check the server URL.";
            }
            else
            {
                ErrorMessage = $"Login failed: {errorMsg}";
            }
            
            StatusMessage = string.Empty;
        }
        finally
        {
            IsLoading = false;
        }
    }
}
