using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class AuthService : IAuthService
{
    private readonly ILogger<AuthService> _logger;
    private readonly HttpClient _httpClient;
    private readonly ISocketService _socketService;
    private readonly IConfigurationService _configService;
    private User? _currentUser;
    private string? _authToken;

    public User? CurrentUser => _currentUser;
    public string? AuthToken => _authToken;
    public bool IsAuthenticated => _currentUser != null && !string.IsNullOrEmpty(_authToken);

    public event EventHandler<User>? UserAuthenticated;
    public event EventHandler? UserLoggedOut;

    public AuthService(ILogger<AuthService> logger, HttpClient httpClient, ISocketService socketService, IConfigurationService configService)
    {
        _logger = logger;
        _httpClient = httpClient;
        _socketService = socketService;
        _configService = configService;
        
        // Set initial base address from configuration
        UpdateBaseAddress(_configService.ServerUrl);
    }

    public void UpdateBaseAddress(string serverUrl)
    {
        try
        {
            // Ensure URL doesn't end with a slash to avoid double slashes
            var cleanUrl = serverUrl.TrimEnd('/');
            _httpClient.BaseAddress = new Uri(cleanUrl);
            _logger.LogInformation("HTTP client base address updated to: {Url}", cleanUrl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update base address: {Url}", serverUrl);
        }
    }

    public async Task<bool> LoginAsync(string username, string password)
    {
        _logger.LogInformation("=== LoginAsync called for username: {Username} ===", username);
        try
        {
            var loginRequest = new
            {
                username,
                password
            };

            var json = JsonSerializer.Serialize(loginRequest);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var loginUrl = _httpClient.BaseAddress?.ToString().TrimEnd('/') + "/api/auth/login";
            _logger.LogInformation("Attempting login to: {LoginUrl}", loginUrl);
            _logger.LogInformation("Username: {Username}", username);
            
            HttpResponseMessage? response = null;
            try
            {
                // Ensure no double slashes in the URL
                var apiPath = "/api/auth/login";
                if (_httpClient.BaseAddress != null && _httpClient.BaseAddress.ToString().EndsWith("/"))
                {
                    apiPath = apiPath.TrimStart('/');
                }
                response = await _httpClient.PostAsync(apiPath, content);
            }
            catch (HttpRequestException httpEx)
            {
                _logger.LogError(httpEx, "HTTP request failed: {Message}", httpEx.Message);
                throw new Exception($"Cannot connect to server: {httpEx.Message}", httpEx);
            }
            catch (TaskCanceledException timeoutEx)
            {
                _logger.LogError(timeoutEx, "Request timeout");
                throw new Exception("Connection timeout. Please check the server URL and ensure the server is running.", timeoutEx);
            }
            
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Login failed: {StatusCode}, Response: {Error}", response.StatusCode, errorContent);
                
                if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    throw new Exception($"Server endpoint not found. Please check the server URL: {_httpClient.BaseAddress}");
                }
                else if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    return false; // Invalid credentials
                }
                else
                {
                    throw new Exception($"Server returned error: {response.StatusCode} - {errorContent}");
                }
            }

            var responseContent = await response.Content.ReadAsStringAsync();
            _logger.LogInformation("Login response received: {Response}", responseContent);
            
            LoginResponse? loginResponse = null;
            try
            {
                loginResponse = JsonSerializer.Deserialize<LoginResponse>(responseContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            catch (Exception deserializeEx)
            {
                _logger.LogError(deserializeEx, "Failed to deserialize login response: {Response}", responseContent);
                throw new Exception($"Failed to parse server response: {deserializeEx.Message}", deserializeEx);
            }

            if (loginResponse == null)
            {
                _logger.LogWarning("Login response is null after deserialization. Response content: {Response}", responseContent);
                return false;
            }

            _logger.LogInformation("Login response deserialized - Success: {Success}, Token present: {HasToken}, User present: {HasUser}", 
                loginResponse.Success, !string.IsNullOrEmpty(loginResponse.Token), loginResponse.User != null);

            if (string.IsNullOrEmpty(loginResponse.Token))
            {
                _logger.LogWarning("Login response token is null or empty. Response: {Response}", responseContent);
                return false;
            }

            if (loginResponse.User == null)
            {
                _logger.LogWarning("Login response user is null. Response: {Response}", responseContent);
                return false;
            }

            _authToken = loginResponse.Token;
            _currentUser = loginResponse.User;
            
            // Log user configuration for debugging
            if (_currentUser != null)
            {
                _logger.LogInformation("User deserialized - Username: {Username}, IntercomEnabled: {IntercomEnabled}, DealerboardEnabled: {DealerboardEnabled}", 
                    _currentUser.Username, _currentUser.IntercomEnabled, _currentUser.DealerboardEnabled);
            }
            else
            {
                _logger.LogWarning("User object is null in login response");
            }

            // Set auth header for future requests
            _httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", _authToken);
            
            _logger.LogInformation("Auth token set in AuthService - Token length: {TokenLength}, IsAuthenticated: {IsAuthenticated}", 
                _authToken?.Length ?? 0, IsAuthenticated);

            // Connect socket and authenticate (don't fail login if socket connection fails)
            // Use a timeout to prevent hanging on slow connections, but continue in background
            try
            {
                var serverUrl = _httpClient.BaseAddress?.ToString() ?? _configService.ServerUrl;
                
                // Start connection in background - don't block login
                _ = Task.Run(async () =>
                {
                    try
                    {
                        _logger.LogInformation("Starting background Socket.IO connection attempt...");
                        await _socketService.ConnectAsync(serverUrl, _authToken);
                        
                        if (_currentUser != null && !string.IsNullOrEmpty(_authToken))
                        {
                            await _socketService.AuthenticateAsync(
                                _currentUser.Id,
                                _currentUser.Username,
                                _authToken);
                            _logger.LogInformation("Background Socket.IO connection and authentication completed successfully");
                        }
                    }
                    catch (Exception connectEx)
                    {
                        _logger.LogError(connectEx, "Background Socket.IO connection failed with exception: {ExceptionType}: {Message}. StackTrace: {StackTrace}", 
                            connectEx.GetType().Name, connectEx.Message, connectEx.StackTrace);
                        // Don't rethrow - this is a background task, but we want to log the full error
                    }
                });
                
                _logger.LogInformation("Socket.IO connection started in background. Login will continue without waiting.");
            }
            catch (Exception socketEx)
            {
                // Log socket connection error but don't fail the login
                // User can still use the app, socket will retry automatically
                _logger.LogWarning(socketEx, "Failed to start Socket.IO connection in background, but login succeeded. Socket will retry automatically.");
            }

            _logger.LogInformation("User authenticated: {Username}", username);
            _logger.LogInformation("About to return true from LoginAsync - IsAuthenticated: {IsAuthenticated}", IsAuthenticated);
            
            // Ensure _currentUser is not null before invoking event
            if (_currentUser != null)
            {
                _logger.LogInformation("Invoking UserAuthenticated event for user: {Username}, Event handler count: {HandlerCount}", 
                    _currentUser.Username, UserAuthenticated?.GetInvocationList().Length ?? 0);
                try
                {
                    UserAuthenticated?.Invoke(this, _currentUser);
                    _logger.LogInformation("UserAuthenticated event invoked successfully");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error invoking UserAuthenticated event: {Message}", ex.Message);
                }
            }
            else
            {
                _logger.LogError("Cannot invoke UserAuthenticated event: _currentUser is null");
            }
            
            _logger.LogInformation("LoginAsync returning TRUE for user: {Username}", username);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Login error: {Message}, Inner: {InnerException}", ex.Message, ex.InnerException?.Message);
            _logger.LogError("LoginAsync returning FALSE due to exception for username: {Username}", username);
            return false;
        }
    }

    public async Task<bool> LoginWithTokenAsync(string token)
    {
        try
        {
            _authToken = token;
            _httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", _authToken);

            // Verify token by getting user info
            var response = await _httpClient.GetAsync("/api/auth/me");
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Token validation failed: {StatusCode}", response.StatusCode);
                return false;
            }

            var responseContent = await response.Content.ReadAsStringAsync();
            _currentUser = JsonSerializer.Deserialize<User>(responseContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (_currentUser == null)
            {
                return false;
            }

            // Connect socket and authenticate
            var serverUrl = _httpClient.BaseAddress?.ToString() ?? _configService.ServerUrl;
            await _socketService.ConnectAsync(serverUrl, _authToken);
            await _socketService.AuthenticateAsync(
                _currentUser.Id,
                _currentUser.Username,
                _authToken);

            _logger.LogInformation("User authenticated with token: {Username}", _currentUser.Username);
            UserAuthenticated?.Invoke(this, _currentUser);
            
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token login error");
            return false;
        }
    }

    public async Task LogoutAsync()
    {
        try
        {
            await _socketService.DisconnectAsync();
            
            _httpClient.DefaultRequestHeaders.Authorization = null;
            _currentUser = null;
            _authToken = null;

            _logger.LogInformation("User logged out");
            UserLoggedOut?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Logout error");
        }
    }

    public async Task<bool> RefreshTokenAsync()
    {
        try
        {
            var response = await _httpClient.PostAsync("/api/auth/refresh", null);
            
            if (!response.IsSuccessStatusCode)
            {
                return false;
            }

            var responseContent = await response.Content.ReadAsStringAsync();
            var refreshResponse = JsonSerializer.Deserialize<LoginResponse>(responseContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (refreshResponse == null || string.IsNullOrEmpty(refreshResponse.Token))
            {
                return false;
            }

            _authToken = refreshResponse.Token;
            _httpClient.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", _authToken);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Token refresh error");
            return false;
        }
    }

    private class LoginResponse
    {
        public bool Success { get; set; }
        public string Token { get; set; } = string.Empty;
        public User? User { get; set; }
        public string? ExpiresIn { get; set; }
    }
}

