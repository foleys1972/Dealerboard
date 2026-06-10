using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class AuthService : IAuthService
{
    private readonly ILogger<AuthService> _logger;
    private readonly HttpClientHandler _httpHandler;
    private HttpClient _httpClient;
    private readonly ISocketService _socketService;
    private readonly IConfigurationService _configService;
    private User? _currentUser;
    private string? _authToken;
    private string _apiBaseUrl = string.Empty;

    private CancellationTokenSource? _routingWatcherCts;

    public User? CurrentUser => _currentUser;
    public string? AuthToken => _authToken;
    public bool IsAuthenticated => _currentUser != null && !string.IsNullOrEmpty(_authToken);

    public event EventHandler<User>? UserAuthenticated;
    public event EventHandler? UserLoggedOut;

    public AuthService(ILogger<AuthService> logger, ISocketService socketService, IConfigurationService configService)
    {
        _logger = logger;
        _socketService = socketService;
        _configService = configService;
        _httpHandler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (_, _, _, _) => true,
        };
        _httpClient = CreateHttpClient();

        UpdateBaseAddress(_configService.ServerUrl);

        // Restore last-known subscriber candidates (best-effort)
        try
        {
            var candidates = _configService.GetValue<List<string>>("subscriberServerCandidates");
            if (candidates != null && candidates.Count > 0)
            {
                _socketService.SetServerCandidates(candidates);
            }
        }
        catch { }
    }

    private void StartRoutingWatcher()
    {
        try
        {
            _routingWatcherCts?.Cancel();
            _routingWatcherCts = new CancellationTokenSource();
            var ct = _routingWatcherCts.Token;

            _ = Task.Run(async () =>
            {
                while (!ct.IsCancellationRequested)
                {
                    try
                    {
                        await Task.Delay(TimeSpan.FromSeconds(20), ct);
                        if (ct.IsCancellationRequested) break;
                        if (!IsAuthenticated || string.IsNullOrWhiteSpace(_authToken)) continue;

                        var resp = await SendApiAsync(HttpMethod.Get, "/api/auth/me", cancellationToken: ct);
                        if (!resp.IsSuccessStatusCode) continue;
                        var json = await resp.Content.ReadAsStringAsync(ct);
                        var me = JsonSerializer.Deserialize<MeResponse>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                        var newUser = me?.User;
                        if (newUser == null) continue;

                        // Apply routing updates if recommended subscriber changes.
                        var prevUrl = _currentUser?.RecommendedSubscriberUrl;
                        var nextUrl = newUser.RecommendedSubscriberUrl;
                        if (!string.IsNullOrWhiteSpace(nextUrl) && !string.Equals(prevUrl?.TrimEnd('/'), nextUrl.TrimEnd('/'), StringComparison.OrdinalIgnoreCase))
                        {
                            _logger.LogWarning("Routing change detected mid-session: {Prev} -> {Next}", prevUrl, nextUrl);
                            ApplyRoutingAndReconnect(newUser);
                        }

                        // Always keep a fresh user snapshot (settings/flags/etc).
                        _currentUser = newUser;
                    }
                    catch (OperationCanceledException)
                    {
                        // normal
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Routing watcher tick failed");
                    }
                }
            }, ct);
        }
        catch { }
    }

    private void ApplyRoutingAndReconnect(User user)
    {
        try
        {
            var routedBaseUrl = user?.RecommendedSubscriberUrl;
            if (string.IsNullOrWhiteSpace(routedBaseUrl)) return;
            routedBaseUrl = routedBaseUrl.TrimEnd('/');

            var candidates = new List<string>();
            candidates.Add(routedBaseUrl);
            if (user?.FailoverSubscriberUrls != null)
            {
                foreach (var u in user.FailoverSubscriberUrls)
                {
                    if (!string.IsNullOrWhiteSpace(u)) candidates.Add(u.TrimEnd('/'));
                }
            }
            if (!string.IsNullOrWhiteSpace(_configService.ServerUrl))
            {
                candidates.Add(_configService.ServerUrl.TrimEnd('/'));
            }

            candidates = candidates
                .Where(u => !string.IsNullOrWhiteSpace(u))
                .Select(u => u.TrimEnd('/'))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            _configService.ServerUrl = routedBaseUrl;
            _configService.SetValue("subscriberServerCandidates", candidates);
            _configService.Save();
            UpdateBaseAddress(routedBaseUrl);

            _socketService.SetServerCandidates(candidates);

            // Force reconnect to the new primary.
            var token = _authToken;
            if (!string.IsNullOrWhiteSpace(token))
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _socketService.DisconnectAsync();
                    }
                    catch { }
                    try
                    {
                        await _socketService.ConnectAsync(routedBaseUrl, token);
                        if (_currentUser != null)
                        {
                            await _socketService.AuthenticateAsync(_currentUser.Id, _currentUser.Username, token);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to reconnect socket after routing change");
                    }
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to apply routing change");
        }
    }

    public void UpdateBaseAddress(string serverUrl)
    {
        var cleanUrl = ServerUrlHelper.Normalize(serverUrl);
        if (!Uri.TryCreate(cleanUrl, UriKind.Absolute, out _))
        {
            _logger.LogError("Invalid server URL: {Url}", serverUrl);
            return;
        }

        if (string.Equals(_apiBaseUrl, cleanUrl, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var previousAuth = _httpClient.DefaultRequestHeaders.Authorization;
        _apiBaseUrl = cleanUrl;
        _httpClient.Dispose();
        _httpClient = CreateHttpClient();
        if (previousAuth != null)
        {
            _httpClient.DefaultRequestHeaders.Authorization = previousAuth;
        }

        _logger.LogInformation("API base URL set to: {Url}", cleanUrl);
    }

    private HttpClient CreateHttpClient()
    {
        return new HttpClient(_httpHandler, disposeHandler: false)
        {
            Timeout = TimeSpan.FromSeconds(30),
        };
    }

    private Task<HttpResponseMessage> SendApiAsync(
        HttpMethod method,
        string path,
        HttpContent? content = null,
        CancellationToken cancellationToken = default)
    {
        var request = new HttpRequestMessage(method, BuildApiUri(path))
        {
            Content = content,
        };
        return _httpClient.SendAsync(request, cancellationToken);
    }

    private Uri BuildApiUri(string path)
    {
        var baseUrl = ServerUrlHelper.Normalize(
            !string.IsNullOrWhiteSpace(_apiBaseUrl) ? _apiBaseUrl : _configService.ServerUrl);
        if (string.IsNullOrWhiteSpace(baseUrl) || !Uri.TryCreate(baseUrl, UriKind.Absolute, out _))
        {
            throw new InvalidOperationException("Server URL is not configured or invalid");
        }

        var normalizedPath = path.StartsWith('/') ? path : $"/{path}";
        return new Uri($"{baseUrl}{normalizedPath}");
    }

    public string GetActiveServerUrl() => ResolveActiveServerUrl();

    private string ResolveActiveServerUrl()
    {
        if (!string.IsNullOrWhiteSpace(_apiBaseUrl))
        {
            return _apiBaseUrl.TrimEnd('/');
        }

        return ServerUrlHelper.Normalize(_configService.ServerUrl);
    }

    private static bool ShouldPreferLoginServerUrl(string loginServerUrl, string routedServerUrl)
    {
        if (string.IsNullOrWhiteSpace(loginServerUrl))
        {
            return false;
        }

        if (!Uri.TryCreate(loginServerUrl, UriKind.Absolute, out var login))
        {
            return false;
        }

        if (!Uri.TryCreate(routedServerUrl, UriKind.Absolute, out var routed))
        {
            return false;
        }

        var routedIsLoopback = routed.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
            || routed.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase);
        var loginIsRemote = !login.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
            && !login.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase);

        return routedIsLoopback && loginIsRemote;
    }

    public async Task<bool> LoginAsync(string username, string password)
    {
        _logger.LogInformation("=== LoginAsync called for username: {Username} ===", username);
        try
        {
            if (!string.IsNullOrWhiteSpace(_configService.ServerUrl))
            {
                UpdateBaseAddress(_configService.ServerUrl);
            }

            var loginRequest = new
            {
                username,
                password
            };

            var json = JsonSerializer.Serialize(loginRequest);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var loginUrl = BuildApiUri("/api/auth/login").ToString();
            _logger.LogInformation("Attempting login to: {LoginUrl}", loginUrl);
            _logger.LogInformation("Username: {Username}", username);
            
            HttpResponseMessage? response = null;
            try
            {
                response = await SendApiAsync(HttpMethod.Post, "/api/auth/login", content);
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
                    throw new Exception($"Server endpoint not found. Please check the server URL: {GetActiveServerUrl()}");
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

            // Enterprise routing: if the login payload includes an assigned homeserver,
            // switch API + Socket.IO base to that server (subscriber) for all subsequent calls.
            try
            {
                var routedBaseUrl = _currentUser?.RecommendedSubscriberUrl;
                if (string.IsNullOrWhiteSpace(routedBaseUrl))
                {
                    routedBaseUrl = _currentUser?.MatrixHomeserver?.BaseUrl;
                }
                if (!string.IsNullOrWhiteSpace(routedBaseUrl))
                {
                    var loginServerUrl = ServerUrlHelper.Normalize(_configService.ServerUrl);
                    routedBaseUrl = ServerUrlHelper.Normalize(routedBaseUrl);
                    if (ShouldPreferLoginServerUrl(loginServerUrl, routedBaseUrl))
                    {
                        _logger.LogInformation(
                            "Keeping login server URL {LoginUrl} instead of routed subscriber URL {RoutedUrl}",
                            loginServerUrl,
                            routedBaseUrl);
                        routedBaseUrl = loginServerUrl;
                    }

                    _logger.LogInformation("Routing client to homeserver baseUrl: {BaseUrl}", routedBaseUrl);

                    try
                    {
                        var candidates = new List<string>();
                        candidates.Add(routedBaseUrl);
                        if (_currentUser?.FailoverSubscriberUrls != null)
                        {
                            foreach (var u in _currentUser.FailoverSubscriberUrls)
                            {
                                if (!string.IsNullOrWhiteSpace(u)) candidates.Add(u.TrimEnd('/'));
                            }
                        }

                        // Include the current configured ServerUrl as a last-resort fallback.
                        if (!string.IsNullOrWhiteSpace(_configService.ServerUrl))
                        {
                            candidates.Add(_configService.ServerUrl.TrimEnd('/'));
                        }

                        candidates = candidates
                            .Where(u => !string.IsNullOrWhiteSpace(u))
                            .Select(u => u.TrimEnd('/'))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToList();

                        _configService.SetValue("subscriberServerCandidates", candidates);
                        _socketService.SetServerCandidates(candidates);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to configure socket server candidates");
                    }

                    _configService.ServerUrl = routedBaseUrl;
                    _configService.Save();
                    UpdateBaseAddress(routedBaseUrl);
                }
            }
            catch (Exception routeEx)
            {
                _logger.LogWarning(routeEx, "Failed to apply homeserver routing; continuing with configured ServerUrl={ServerUrl}", _configService.ServerUrl);
            }
            
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

            StartRoutingWatcher();
            
            _logger.LogInformation("Auth token set in AuthService - Token length: {TokenLength}, IsAuthenticated: {IsAuthenticated}", 
                _authToken?.Length ?? 0, IsAuthenticated);

            // Connect socket and authenticate (don't fail login if socket connection fails)
            // Use a timeout to prevent hanging on slow connections, but continue in background
            try
            {
                var serverUrl = GetActiveServerUrl();
                
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
            var response = await SendApiAsync(HttpMethod.Get, "/api/auth/me");
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Token validation failed: {StatusCode}", response.StatusCode);
                return false;
            }

            var responseContent = await response.Content.ReadAsStringAsync();
            var me = JsonSerializer.Deserialize<MeResponse>(responseContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            _currentUser = me?.User;

            if (_currentUser == null)
            {
                return false;
            }

            // Connect socket and authenticate
            var serverUrl = GetActiveServerUrl();
            await _socketService.ConnectAsync(serverUrl, _authToken);
            await _socketService.AuthenticateAsync(
                _currentUser.Id,
                _currentUser.Username,
                _authToken);

            StartRoutingWatcher();

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
            try { _routingWatcherCts?.Cancel(); } catch { }
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
            var response = await SendApiAsync(HttpMethod.Post, "/api/auth/refresh");
            
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

    private class MeResponse
    {
        public bool Success { get; set; }
        public User? User { get; set; }
    }
}

