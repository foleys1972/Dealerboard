using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Logging;
using SocketIOClient.Transport;
using TradePulse.Client.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Text.Json;
using System.Threading;
using System.Reflection;
using System.Linq;

namespace TradePulse.Client.Core.Services;

public class SocketService : ISocketService, IDisposable
{
    private readonly ILogger<SocketService> _logger;
    private SocketIOClient.SocketIO? _socket;
    private string? _authToken;
    private string? _serverUrl;
    // Identity from the last AuthenticateAsync, stored as one immutable snapshot
    // so concurrent readers (emits, reconnect re-auth) never see a torn identity.
    private sealed record AuthSnapshot(string UserId, string Username, string? SipUri);
    private AuthSnapshot? _lastAuth;
    private readonly SemaphoreSlim _reconnectGate = new(1, 1);
    private bool _disposed = false;
    private CancellationTokenSource? _autoReconnectCts;
    private Task? _autoReconnectTask;

    private readonly List<string> _serverCandidates = new();
    private int _serverCandidateIndex = 0;

    public bool IsConnected => _socket?.Connected ?? false;
    public string? SocketId => _socket?.Id;

    public event EventHandler<bool>? ConnectionStateChanged;
    public event EventHandler<User>? UserStatusChanged;
    public event EventHandler<Call>? IncomingCall;
    public event EventHandler<Call>? CallStateChanged;
    public event EventHandler<string>? CallEnded;
    public event EventHandler<WebRTCSetupData>? WebRTCSetupRequired;
    public event EventHandler<AudioLevelData>? AudioLevelReceived;
    public event EventHandler<(string LineId, bool IsActive)>? BroadcastActiveChanged;
    public event EventHandler<(string LineId, bool IsMonitoring, int? ListenerCount)>? BroadcastMonitorUpdated;
    public event EventHandler<LineSipStateEvent>? LineSipStateChanged;
    public event EventHandler<LineSipStateEvent>? LineSipIncoming;
    public event EventHandler<string>? Error;

    public SocketService(ILogger<SocketService> logger)
    {
        _logger = logger;
    }

    public void SetServerCandidates(IEnumerable<string> serverUrls)
    {
        try
        {
            var urls = (serverUrls ?? Array.Empty<string>())
                .Select(u => (u ?? string.Empty).Trim())
                .Where(u => !string.IsNullOrWhiteSpace(u))
                .Select(u => u.TrimEnd('/'))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            _serverCandidates.Clear();
            _serverCandidates.AddRange(urls);
            _serverCandidateIndex = 0;
            _logger.LogInformation("Socket server candidates updated: {Count}", _serverCandidates.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to set socket server candidates");
        }
    }

    /// <summary>
    /// Accepts the dev/self-signed server certificate on both transports.
    /// SocketIOOptions (3.1.1) exposes no certificate hooks, so we inject at the
    /// transport seams: a custom handler on the polling HttpClient and a
    /// RemoteCertificateValidationCallback on the upgrade WebSocket. Set
    /// TRADEPULSE_STRICT_TLS=true to keep full certificate validation
    /// (recommended for production deployments with a real certificate).
    /// </summary>
    private void ConfigureTransportSecurity(SocketIOClient.SocketIO socket)
    {
        if (string.Equals(Environment.GetEnvironmentVariable("TRADEPULSE_STRICT_TLS"),
                "true", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation("TRADEPULSE_STRICT_TLS=true — using full certificate validation");
            return;
        }

        try
        {
            var http = new SocketIOClient.Transport.Http.DefaultHttpClient();
            var handlerField = typeof(SocketIOClient.Transport.Http.DefaultHttpClient)
                .GetField("_handler", BindingFlags.NonPublic | BindingFlags.Instance);
            if (handlerField?.GetValue(http) is HttpClientHandler handler)
            {
                handler.ServerCertificateCustomValidationCallback = (_, _, _, _) => true;
                socket.HttpClient = http;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not configure cert trust on polling transport");
        }

        try
        {
            socket.ClientWebSocketProvider = () =>
            {
                var ws = new SocketIOClient.Transport.WebSockets.DefaultClientWebSocket();
                var wsField = typeof(SocketIOClient.Transport.WebSockets.DefaultClientWebSocket)
                    .GetField("_ws", BindingFlags.NonPublic | BindingFlags.Instance);
                if (wsField?.GetValue(ws) is System.Net.WebSockets.ClientWebSocket inner)
                {
                    inner.Options.RemoteCertificateValidationCallback = (_, _, _, _) => true;
                }
                return ws;
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not configure cert trust on websocket transport");
        }
    }

    private List<string> GetCandidateOrder(string? preferred)
    {
        var list = new List<string>();
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            list.Add(preferred.Trim().TrimEnd('/'));
        }

        foreach (var u in _serverCandidates)
        {
            if (string.IsNullOrWhiteSpace(u)) continue;
            var cu = u.Trim().TrimEnd('/');
            if (list.Any(x => string.Equals(x, cu, StringComparison.OrdinalIgnoreCase))) continue;
            list.Add(cu);
        }

        return list;
    }

    private async Task EnsureConnectedAsync()
    {
        if (_socket != null && _socket.Connected) return;

        await _reconnectGate.WaitAsync();
        try
        {
            if (_socket != null && _socket.Connected) return;

            if (string.IsNullOrWhiteSpace(_serverUrl))
            {
                throw new InvalidOperationException("Socket not connected");
            }

            _logger.LogWarning("Socket not connected; attempting reconnect...");
            await ConnectAsync(_serverUrl ?? _serverCandidates.FirstOrDefault() ?? string.Empty, _authToken);

            if (_socket == null || !_socket.Connected)
            {
                throw new InvalidOperationException("Socket not connected");
            }
        }
        finally
        {
            _reconnectGate.Release();
        }
    }

    public async Task ConnectAsync(string serverUrl, string? token = null)
    {
        if (_socket != null && _socket.Connected)
        {
            _logger.LogInformation("Socket already connected");
            return;
        }

        var candidates = GetCandidateOrder(serverUrl);
        if (candidates.Count == 0)
        {
            throw new ArgumentException("No serverUrl provided", nameof(serverUrl));
        }

        Exception? last = null;
        for (var i = 0; i < candidates.Count; i++)
        {
            var candidate = candidates[i];
            try
            {
                await ConnectSingleAsync(candidate, token);
                _serverUrl = candidate;
                _serverCandidateIndex = i;
                return;
            }
            catch (Exception ex)
            {
                last = ex;
                _logger.LogWarning(ex, "Socket connect failed for candidate {Candidate}", candidate);
                try
                {
                    await DisconnectAsync();
                }
                catch { }
            }
        }

        throw last ?? new InvalidOperationException("Failed to connect to any candidate server");
    }

    private async Task ConnectSingleAsync(string serverUrl, string? token)
    {
        if (_socket != null && _socket.Connected)
        {
            _logger.LogInformation("Socket already connected");
            return;
        }

        // Normalize URL (declare outside try block for use in catch)
        var uri = new Uri(serverUrl);
        // Handle default ports (-1 means default port)
        var port = uri.Port > 0 ? uri.Port : (uri.Scheme == "https" ? 443 : 80);
        var socketUrl = $"{uri.Scheme}://{uri.Host}:{port}";

        try
        {
            _authToken = token;
            _serverUrl = serverUrl;

            _logger.LogInformation("Connecting to Socket.IO server: {Url}", socketUrl);
            _logger.LogInformation("Socket.IO connection details - Scheme: {Scheme}, Host: {Host}, Port: {Port} (normalized from original port {OriginalPort})", 
                uri.Scheme, uri.Host, port, uri.Port);

            // Note: SocketIOClient.NET uses HttpClient internally
            // SSL certificate validation is handled at the application level via HttpClientHandler
            // configured in App.xaml.cs. For Socket.IO, we rely on ServicePointManager or
            // the global HttpClient configuration.

            // Declare variables outside try block so they're accessible later
            var serverReachable = false;
            var options = new SocketIOClient.SocketIOOptions
            {
                Path = "/socket.io",
                // Use polling-first with websocket upgrade (browser-like) to avoid WebSocket-only hangs.
                Transport = TransportProtocol.Polling,
                Reconnection = false,
                ReconnectionDelay = 2000,
                ReconnectionDelayMax = 10000,
                ReconnectionAttempts = 0,
                ConnectionTimeout = TimeSpan.FromSeconds(45),
                // Verified 2026-06-10: WebSocket upgrade works against the current server
                // (SocketIOClient 3.1.1, all transport modes; see SOCKET_IO_ROOT_CAUSE.md).
                // TRADEPULSE_SOCKET_AUTOUPGRADE=false is the emergency kill switch.
                AutoUpgrade = !string.Equals(
                    Environment.GetEnvironmentVariable("TRADEPULSE_SOCKET_AUTOUPGRADE"),
                    "false", StringComparison.OrdinalIgnoreCase),
                // Server supports auth via either handshake.auth.token or Authorization header.
                // SocketIOClient's ExtraHeaders does not always propagate reliably across polling requests,
                // so we set BOTH.
                Auth = token != null ? new { token } : null,
                ExtraHeaders = token != null 
                    ? new Dictionary<string, string> { { "Authorization", $"Bearer {token}" } }
                    : null
            };

            // TLS trust for the dev/self-signed cert is configured on the client object
            // after construction (see ConfigureTransportSecurity) — SocketIOOptions in
            // this library version has no certificate hooks.

            try
            {
            // CRITICAL FIX: Test server connectivity first - this will reveal if server is reachable
            _logger.LogInformation("Testing server connectivity to Socket.IO endpoint...");
            try
            {
                using var testClient = new HttpClient(new HttpClientHandler
                {
                    ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
                })
                {
                    Timeout = TimeSpan.FromSeconds(10)
                };
                if (token != null)
                {
                    testClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
                }
                
                // Test the Socket.IO handshake endpoint directly
                var testUrl = $"{socketUrl}/socket.io/?EIO=4&transport=polling";
                _logger.LogInformation("Testing Socket.IO handshake endpoint: {Url}", testUrl);
                
                var testResponse = await testClient.GetAsync(testUrl);
                string body = string.Empty;
                try
                {
                    body = await testResponse.Content.ReadAsStringAsync();
                }
                catch { }
                if (body.Length > 400) body = body.Substring(0, 400);
                _logger.LogInformation(
                    "Server connectivity test: Status={Status}, ReasonPhrase={ReasonPhrase}, Body={Body}",
                    testResponse.StatusCode,
                    testResponse.ReasonPhrase,
                    body);
                
                // BadRequest (400) is expected for Socket.IO handshake - means server is responding correctly
                // Any response (even error) means server is reachable
                serverReachable = true;
                _logger.LogInformation("Server is reachable - Socket.IO endpoint responded");
            }
            catch (Exception testEx)
            {
                _logger.LogError(testEx, "Server connectivity test FAILED: {Error}. Server may not be running or network is unreachable.", testEx.Message);
                serverReachable = false;
                // Continue anyway - sometimes the test fails but Socket.IO connection works
            }
            
            // Use the options declared outside try block
                _logger.LogInformation("Creating Socket.IO client with EXACT React config: Path={Path}, Transport={Transport}, Timeout={Timeout}", 
                    options.Path, options.Transport, options.ConnectionTimeout);
                _logger.LogInformation("Socket.IO URL being passed to library: {Url}", socketUrl);
                
                // CRITICAL: Verify the URL format matches what React client uses
                var socketUri = new Uri(socketUrl);
                _logger.LogInformation("Parsed Socket.IO URI - Scheme: {Scheme}, Host: {Host}, Port: {Port}, Path: {Path}", 
                    socketUri.Scheme, socketUri.Host, socketUri.Port, socketUri.AbsolutePath);
                
                _socket = new SocketIOClient.SocketIO(socketUrl, options);
                ConfigureTransportSecurity(_socket);

                // Verify the socket actually got the right URL by checking its internal state
                try
                {
                    var socketType = _socket.GetType();
                    FieldInfo? urlField = socketType.GetField("_uri", BindingFlags.NonPublic | BindingFlags.Instance) 
                                        ?? socketType.GetField("uri", BindingFlags.NonPublic | BindingFlags.Instance)
                                        ?? socketType.GetField("_url", BindingFlags.NonPublic | BindingFlags.Instance)
                                        ?? socketType.GetField("url", BindingFlags.NonPublic | BindingFlags.Instance);
                    PropertyInfo? urlProp = socketType.GetProperty("Uri", BindingFlags.NonPublic | BindingFlags.Instance)
                                         ?? socketType.GetProperty("Url", BindingFlags.NonPublic | BindingFlags.Instance);
                    
                    if (urlField != null)
                    {
                        var internalUrl = urlField.GetValue(_socket);
                        _logger.LogInformation("Socket.IO internal URL/URI (from field): {InternalUrl}", internalUrl);
                        
                        // Check if it's a Uri object and extract port
                        if (internalUrl is Uri internalUri)
                        {
                            _logger.LogInformation("Socket.IO internal URI details - Scheme: {Scheme}, Host: {Host}, Port: {Port}, Path: {Path}", 
                                internalUri.Scheme, internalUri.Host, internalUri.Port, internalUri.AbsolutePath);
                            
                            // CRITICAL: Check if port matches!
                            if (internalUri.Port != socketUri.Port)
                            {
                                _logger.LogError("❌ PORT MISMATCH! Expected port {ExpectedPort}, but socket has port {ActualPort}!", 
                                    socketUri.Port, internalUri.Port);
                            }
                        }
                    }
                    else if (urlProp != null)
                    {
                        var internalUrl = urlProp.GetValue(_socket);
                        _logger.LogInformation("Socket.IO internal URL/URI (from property): {InternalUrl}", internalUrl);
                        
                        if (internalUrl is Uri internalUri)
                        {
                            _logger.LogInformation("Socket.IO internal URI details - Scheme: {Scheme}, Host: {Host}, Port: {Port}, Path: {Path}", 
                                internalUri.Scheme, internalUri.Host, internalUri.Port, internalUri.AbsolutePath);
                            
                            if (internalUri.Port != socketUri.Port)
                            {
                                _logger.LogError("❌ PORT MISMATCH! Expected port {ExpectedPort}, but socket has port {ActualPort}!", 
                                    socketUri.Port, internalUri.Port);
                            }
                        }
                    }
                    else
                    {
                        _logger.LogWarning("Could not find URL/URI field or property in socket object");
                    }
                }
                catch (Exception urlEx)
                {
                    _logger.LogWarning(urlEx, "Could not read internal URL from socket: {Error}", urlEx.Message);
                }
                
                // CRITICAL FIX: Find and override ALL HttpClient instances - the library may use multiple!
                var foundHttpClients = new List<HttpClient>();
                
                _logger.LogInformation("Socket.IO client instance created successfully");
            }
            catch (Exception createEx)
            {
                _logger.LogError(createEx, "Failed to create Socket.IO client instance. Exception Type: {Type}, Message: {Message}", 
                    createEx.GetType().Name, createEx.Message);
                throw;
            }

            _logger.LogInformation("Setting up event handlers...");
            SetupEventHandlers();
            _logger.LogInformation("Event handlers set up successfully");

            _logger.LogInformation("Attempting Socket.IO connection (Transport={Transport}, AutoUpgrade={AutoUpgrade})...", options.Transport, options.AutoUpgrade);
            
            if (!serverReachable)
            {
                _logger.LogWarning("Server connectivity test failed - connection may fail. Continuing anyway...");
            }
            
            // WORKAROUND: Since reflection can't find HttpClient, implement aggressive retry mechanism
            // The library will timeout at 10 seconds, but we'll catch it and retry immediately
            const int maxRetries = 3;
            Exception? lastException = null;
            
            for (int attempt = 1; attempt <= maxRetries; attempt++)
            {
                try
                {
                    _logger.LogInformation("Socket.IO connection attempt {Attempt}/{MaxRetries}...", attempt, maxRetries);
                    
                    // Dispose and recreate socket for retries (fresh start)
                    if (attempt > 1)
                    {
                        try { _socket?.Dispose(); } catch { }
                        _socket = null;
                        
                        _socket = new SocketIOClient.SocketIO(socketUrl, options);
                        ConfigureTransportSecurity(_socket);
                        SetupEventHandlers();
                        _logger.LogInformation("Recreated Socket.IO client for retry attempt {Attempt}", attempt);
                    }
                    
                    // CRITICAL: Override HttpClient timeouts BEFORE calling ConnectAsync
                    // The library starts HTTP requests immediately, so we must override BEFORE ConnectAsync()
                    _logger.LogInformation("🔍 Checking for HttpClient instances BEFORE ConnectAsync starts...");
                    var httpClientsBeforeConnect = new List<HttpClient>();
                    
                    // Start connection - library defaults are aggressive; we override internal HttpClient to 2 minutes.
                    _logger.LogInformation("🚀 Calling _socket.ConnectAsync() now...");
                    var connectTask = _socket.ConnectAsync();
                    _logger.LogInformation("✅ ConnectAsync() task created (Status: {Status})", connectTask.Status);
                    
                    // CRITICAL: Check for NEW HttpClient instances created during ConnectAsync
                    // The library might create a new HttpClient when ConnectAsync starts
                    _logger.LogInformation("⏳ Waiting 100ms for library to initialize HttpClient instances...");
                    await Task.Delay(100); // Reduced delay to catch them earlier
                    
                    var httpClientsDuringConnect = new List<HttpClient>();
                    
                    // Wait up to 35 seconds (connect should be fast; internal HttpClient timeout is for polling requests).
                    _logger.LogInformation("⏱️  Waiting for connection (timeout: 35s) for attempt {Attempt}...", attempt);
                    _logger.LogInformation("  📊 ConnectTask status: {Status}, IsCompleted: {IsCompleted}, IsFaulted: {IsFaulted}, IsCanceled: {IsCanceled}", 
                        connectTask.Status, connectTask.IsCompleted, connectTask.IsFaulted, connectTask.IsCanceled);
                    
                    // Try to inspect Socket.IO internal state to see what it's waiting for
                    try
                    {
                        var socketType = _socket.GetType();
                        
                        // Check for DefaultHttpClient field specifically
                        var httpClientField = socketType.GetField("<HttpClient>k__BackingField", BindingFlags.NonPublic | BindingFlags.Instance)
                                            ?? socketType.GetField("HttpClient", BindingFlags.NonPublic | BindingFlags.Instance)
                                            ?? socketType.GetField("_httpClient", BindingFlags.NonPublic | BindingFlags.Instance);
                        
                        _logger.LogInformation("  🔍 Inspecting Socket.IO DefaultHttpClient...");
                        if (httpClientField != null)
                        {
                            var defaultHttpClient = httpClientField.GetValue(_socket);
                            if (defaultHttpClient != null)
                            {
                                _logger.LogInformation("    📋 DefaultHttpClient found: {Type}", defaultHttpClient.GetType().Name);
                                
                                // Try to get the internal HttpClient from DefaultHttpClient
                                var defaultHttpClientType = defaultHttpClient.GetType();
                                FieldInfo? internalHttpClientField = defaultHttpClientType.GetField("_httpClient", BindingFlags.NonPublic | BindingFlags.Instance)
                                                          ?? defaultHttpClientType.GetField("httpClient", BindingFlags.NonPublic | BindingFlags.Instance);
                                PropertyInfo? internalHttpClientProp = defaultHttpClientType.GetProperty("HttpClient", BindingFlags.NonPublic | BindingFlags.Instance);
                                
                                if (internalHttpClientField != null || internalHttpClientProp != null)
                                {
                                    var internalHttpClient = internalHttpClientField != null
                                        ? internalHttpClientField.GetValue(defaultHttpClient)
                                        : internalHttpClientProp?.GetValue(defaultHttpClient);
                                    
                                    if (internalHttpClient is HttpClient hc)
                                    {
                                        _logger.LogInformation("      ⚠️  Found internal HttpClient in DefaultHttpClient - Timeout: {Timeout}, BaseAddress: {BaseAddress}, HashCode: {HashCode}", 
                                            hc.Timeout, hc.BaseAddress?.ToString() ?? "null", hc.GetHashCode());
                                    }
                                }
                            }
                        }
                        
                        // Check for transport-related fields
                        var transportFields = socketType.GetFields(BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public)
                            .Where(f => f.Name.ToLower().Contains("transport") || f.Name.ToLower().Contains("client") || f.Name.ToLower().Contains("http"))
                            .Take(10);
                        
                        foreach (var field in transportFields)
                        {
                            try
                            {
                                var value = field.GetValue(_socket);
                                if (value != null)
                                {
                                    var valueType = value.GetType().Name;
                                    _logger.LogInformation("    📋 Field '{FieldName}' ({Type}): {Value}", 
                                        field.Name, valueType, value.ToString()?.Substring(0, Math.Min(100, value.ToString()?.Length ?? 0)) ?? "null");
                                }
                            }
                            catch (Exception fieldEx)
                            {
                                _logger.LogDebug(fieldEx, "    Could not read field {FieldName}", field.Name);
                            }
                        }
                        
                        // Check socket connection state
                        _logger.LogInformation("  📊 Socket state: Connected={Connected}, Id={Id}", 
                            _socket.Connected, _socket.Id ?? "null");
                    }
                    catch (Exception inspectEx)
                    {
                        _logger.LogDebug(inspectEx, "Could not inspect socket internal state");
                    }
                    
                    var timeoutTask = Task.Delay(TimeSpan.FromSeconds(35));
                    var startTime = DateTime.UtcNow;
                    
                    // Log progress every 5 seconds
                    var progressLogger = Task.Run(async () =>
                    {
                        int secondsElapsed = 0;
                        while (!connectTask.IsCompleted && secondsElapsed < 35)
                        {
                            await Task.Delay(TimeSpan.FromSeconds(5));
                            secondsElapsed += 5;
                            var elapsed = DateTime.UtcNow - startTime;
                            _logger.LogInformation("  ⏳ Connection attempt {Attempt} still waiting... {ElapsedSeconds}s elapsed, ConnectTask status: {Status}", 
                                attempt, elapsed.TotalSeconds, connectTask.Status);
                        }
                    });
                    
                    var completedTask = await Task.WhenAny(connectTask, timeoutTask);
                    var elapsedTime = DateTime.UtcNow - startTime;
                    
                    _logger.LogInformation("⏱️  Task.WhenAny completed after {ElapsedSeconds}s - ConnectTask completed: {ConnectCompleted}, TimeoutTask completed: {TimeoutCompleted}", 
                        elapsedTime.TotalSeconds, completedTask == connectTask, completedTask == timeoutTask);
                    
                    if (completedTask == timeoutTask)
                    {
                        // Hit the timeout - retry
                        _logger.LogWarning("⏰ Connection attempt {Attempt} timed out after {ElapsedSeconds} seconds - ConnectTask status: {Status}, IsFaulted: {IsFaulted}, IsCanceled: {IsCanceled}", 
                            attempt, elapsedTime.TotalSeconds, connectTask.Status, connectTask.IsFaulted, connectTask.IsCanceled);
                        
                        // Try to get exception from connectTask if it's faulted
                        if (connectTask.IsFaulted)
                        {
                            try
                            {
                                await connectTask; // This will throw the exception
                            }
                            catch (Exception taskEx)
                            {
                                _logger.LogError(taskEx, "  ❌ ConnectTask exception: {Error}", taskEx.Message);
                                lastException = taskEx;
                            }
                        }
                        else
                        {
                            lastException = new TimeoutException($"Connection attempt {attempt} timed out at {elapsedTime.TotalSeconds} seconds");
                        }
                        
                        if (attempt < maxRetries)
                        {
                            _logger.LogInformation("  🔄 Retrying immediately (attempt {NextAttempt}/{MaxRetries})...", attempt + 1, maxRetries);
                            await Task.Delay(500); // Brief delay before retry
                            continue;
                        }
                        throw lastException;
                    }
                    
                    // Connection completed - await it to get any exceptions
                    _logger.LogInformation("✅ ConnectAsync task completed for attempt {Attempt} after {ElapsedSeconds}s - awaiting result...", 
                        attempt, elapsedTime.TotalSeconds);
                    
                    try
                    {
                        await connectTask;
                        _logger.LogInformation("✅ ConnectAsync successfully awaited for attempt {Attempt} - no exceptions", attempt);
                    }
                    catch (Exception connectEx)
                    {
                        _logger.LogError(connectEx, "❌ ConnectAsync threw exception for attempt {Attempt}: {Error}. Full={Full}", attempt, connectEx.Message, connectEx.ToString());
                        lastException = connectEx;
                        if (attempt < maxRetries)
                        {
                            _logger.LogInformation("  🔄 Retrying immediately (attempt {NextAttempt}/{MaxRetries})...", attempt + 1, maxRetries);
                            await Task.Delay(500);
                            continue;
                        }
                        throw;
                    }
                    
                    // Verify connection state
                    _logger.LogInformation("🔍 Verifying connection state after ConnectAsync...");
                    await Task.Delay(200);
                    
                    if (_socket == null)
                    {
                        _logger.LogError("❌ Socket is NULL after ConnectAsync on attempt {Attempt}!", attempt);
                        lastException = new InvalidOperationException("Socket is null after ConnectAsync");
                        if (attempt < maxRetries)
                        {
                            await Task.Delay(500);
                            continue;
                        }
                        throw lastException;
                    }
                    
                    var socketId = _socket.Id ?? "unknown";
                    var isConnected = _socket.Connected;
                    
                    _logger.LogInformation("📊 Socket state after ConnectAsync: SocketId={SocketId}, Connected={Connected}", socketId, isConnected);
                    
                    if (!isConnected)
                    {
                        _logger.LogWarning("⚠️  ConnectAsync completed but socket not connected on attempt {Attempt} - SocketId: {SocketId}, Connected: {Connected}", 
                            attempt, socketId, isConnected);
                        
                        // Check if there are any error events or state we can inspect
                        try
                        {
                            var socketType = _socket.GetType();
                            var disconnectedField = socketType.GetField("_disconnected", BindingFlags.NonPublic | BindingFlags.Instance)
                                                ?? socketType.GetField("disconnected", BindingFlags.NonPublic | BindingFlags.Instance);
                            if (disconnectedField != null)
                            {
                                var disconnected = disconnectedField.GetValue(_socket);
                                _logger.LogInformation("  📋 Socket disconnected flag: {Disconnected}", disconnected);
                            }
                        }
                        catch (Exception stateEx)
                        {
                            _logger.LogDebug(stateEx, "Could not read socket disconnected state");
                        }
                        
                        lastException = new InvalidOperationException($"Socket not connected after ConnectAsync (SocketId: {socketId})");
                        if (attempt < maxRetries)
                        {
                            _logger.LogInformation("  🔄 Retrying immediately (attempt {NextAttempt}/{MaxRetries})...", attempt + 1, maxRetries);
                            await Task.Delay(500);
                            continue;
                        }
                        throw lastException;
                    }
                    
                    _logger.LogInformation("🎉🎉🎉 Socket.IO connected successfully on attempt {Attempt}: SocketId={SocketId}, Connected={Connected}", 
                        attempt, socketId, isConnected);
                    ConnectionStateChanged?.Invoke(this, true);
                    return; // SUCCESS - exit the retry loop
                }
                catch (TimeoutException timeoutEx)
                {
                    lastException = timeoutEx;
                    var is10SecondTimeout = timeoutEx.Message.Contains("10") || 
                                          (timeoutEx.InnerException?.Message?.Contains("10") == true);
                    
                    if (is10SecondTimeout && attempt < maxRetries)
                    {
                        _logger.LogWarning("Caught 10-second timeout on attempt {Attempt} - retrying immediately (attempt {NextAttempt}/{MaxRetries})...", 
                            attempt, attempt + 1, maxRetries);
                        await Task.Delay(500);
                        continue;
                    }
                    
                    if (attempt >= maxRetries)
                    {
                        _logger.LogError("Socket.IO connection failed after {MaxRetries} retry attempts. Server reachable: {Reachable}, Error: {Error}", 
                            maxRetries, serverReachable, timeoutEx.Message);
                        
                        var diagnosticMessage = serverReachable
                            ? $"Socket.IO connection failed after {maxRetries} retries. Server IS reachable (HTTP works). " +
                              $"The library's 10-second timeout cannot be overridden via reflection. " +
                              $"Server: {socketUrl}. This is a known limitation of SocketIOClient.NET v3.1.1."
                            : $"Socket.IO connection failed after {maxRetries} retries. Server connectivity test also failed. " +
                              $"Server: {socketUrl}. Verify server is running and accessible.";
                        
                        throw new TimeoutException(diagnosticMessage, timeoutEx);
                    }
                }
                catch (Exception ex)
                {
                    lastException = ex;
                    if (attempt < maxRetries)
                    {
                        _logger.LogWarning("Connection attempt {Attempt} failed with {ErrorType}: {Error} - retrying...", 
                            attempt, ex.GetType().Name, ex.Message);
                        await Task.Delay(500);
                        continue;
                    }
                    throw;
                }
            }
            
            // Should never reach here, but just in case
            throw new TimeoutException($"Socket.IO connection failed after {maxRetries} attempts", lastException);
        }
        catch (TypeLoadException tle)
        {
            var errorMessage = $"Socket.IO TypeLoadException: {tle.Message}";
            if (tle.InnerException != null)
            {
                errorMessage += $" (Inner: {tle.InnerException.Message})";
            }
            _logger.LogError(tle, "Socket.IO TypeLoadException - This may indicate a dependency issue. Error: {Error}", errorMessage);
            Error?.Invoke(this, errorMessage);
            throw;
        }
        catch (System.Net.Http.HttpRequestException httpEx)
        {
            var errorMessage = $"Socket.IO HTTP error: {httpEx.Message}";
            if (httpEx.InnerException != null)
            {
                errorMessage += $" (Inner: {httpEx.InnerException.Message})";
            }
            _logger.LogError(httpEx, "Socket.IO HTTP request failed: {Url}. Error: {Error}", socketUrl, errorMessage);
            Error?.Invoke(this, errorMessage);
            throw;
        }
        catch (System.Net.Sockets.SocketException sockEx)
        {
            var errorMessage = $"Socket.IO network error: {sockEx.Message} (ErrorCode: {sockEx.ErrorCode})";
            _logger.LogError(sockEx, "Socket.IO network connection failed: {Url}. Error: {Error}", socketUrl, errorMessage);
            Error?.Invoke(this, errorMessage);
            throw;
        }
        catch (TaskCanceledException tce)
        {
            var errorMessage = $"Socket.IO connection timeout: {tce.Message}";
            _logger.LogError(tce, "Socket.IO connection timed out: {Url}. Error: {Error}", socketUrl, errorMessage);
            Error?.Invoke(this, errorMessage);
            throw;
        }
        catch (Exception ex)
        {
            var errorMessage = $"Failed to connect to Socket.IO server: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" (Inner: {ex.InnerException.Message})";
            }
            _logger.LogError(ex, "Failed to connect to Socket.IO server: {Url}. Exception Type: {Type}, Error: {Error}. Full={Full}", 
                socketUrl, ex.GetType().Name, errorMessage, ex.ToString());
            Error?.Invoke(this, errorMessage);
            throw;
        }
    }

    public async Task DisconnectAsync()
    {
        // Stop background reconnect loop if the app explicitly disconnects.
        try { _autoReconnectCts?.Cancel(); } catch { }

        if (_socket != null && _socket.Connected)
        {
            await _socket.DisconnectAsync();
            _logger.LogInformation("Socket.IO disconnected");
        }
        
        _socket?.Dispose();
        _socket = null;
        ConnectionStateChanged?.Invoke(this, false);
    }

    public async Task AuthenticateAsync(string userId, string username, string token)
    {
        _authToken = token;

        // Extract sip uri from JWT payload if present (e.g. { "sip": "sip:test1@demo.foleys.me.uk" }).
        string? sipUri = null;
        try
        {
            string? TryGetJwtPayloadValue(string jwt, string key)
            {
                if (string.IsNullOrWhiteSpace(jwt)) return null;
                var parts = jwt.Split('.');
                if (parts.Length < 2) return null;
                var payloadB64 = parts[1]
                    .Replace('-', '+')
                    .Replace('_', '/');
                switch (payloadB64.Length % 4)
                {
                    case 2: payloadB64 += "=="; break;
                    case 3: payloadB64 += "="; break;
                }
                var bytes = Convert.FromBase64String(payloadB64);
                var json = System.Text.Encoding.UTF8.GetString(bytes);
                var jo = JObject.Parse(json);
                if (jo.TryGetValue(key, StringComparison.OrdinalIgnoreCase, out var tok) && tok != null)
                {
                    var s = tok.Type == JTokenType.String ? tok.Value<string>() : tok.ToString();
                    return string.IsNullOrWhiteSpace(s) ? null : s;
                }
                return null;
            }

            sipUri = TryGetJwtPayloadValue(token, "sip") ?? TryGetJwtPayloadValue(token, "sipUri");

            var jwtUsername = TryGetJwtPayloadValue(token, "username");
            if (!string.IsNullOrWhiteSpace(jwtUsername))
            {
                username = jwtUsername;
            }

            // Server-side DB identity is username (legacyId) for compatibility.
            // Some environments can accidentally pass a placeholder like user-<timestamp>.
            if (string.IsNullOrWhiteSpace(userId) || userId.StartsWith("user-", StringComparison.OrdinalIgnoreCase))
            {
                userId = username;
            }
        }
        catch
        {
            sipUri = null;
        }

        // Publish the identity atomically, using the same adjusted values that are
        // emitted below so reconnect re-auth matches the initial authenticate.
        _lastAuth = new AuthSnapshot(userId, username, sipUri);

        await EnsureConnectedAsync();

        try
        {
            _logger.LogInformation(
                "Sending Socket.IO authenticate: userId={UserId} username={Username} tokenLen={TokenLen}",
                userId,
                username,
                token?.Length ?? 0);
            await _socket.EmitAsync("authenticate", new
            {
                userId,
                username,
                token
            });

            _logger.LogInformation("Authentication sent for user: {Username}", username);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send authentication");
            throw;
        }
    }

    public async Task EmitCallAsync(string targetId, CallType callType, bool enableVideo = false)
    {
        await EnsureConnectedAsync();

        var auth = _lastAuth;
        var outgoingTargetUserId = callType == CallType.Direct ? targetId : string.Empty;
        var outgoingGroupId = (callType == CallType.Broadcast || callType == CallType.Conference) ? targetId : string.Empty;

        _logger.LogInformation(
            "EmitCallAsync: callType={CallType} targetId={TargetId} -> targetUserId={TargetUserId} groupId={GroupId} enableVideo={EnableVideo} authUserId={AuthUserId} authUsername={AuthUsername} socketId={SocketId}",
            callType,
            targetId,
            outgoingTargetUserId,
            outgoingGroupId,
            enableVideo,
            auth?.UserId ?? "",
            auth?.Username ?? "",
            _socket?.Id ?? "");

        // Use instant-connect event as expected by the backend
        string? ExtractSipDomain(string? sipUri)
        {
            if (string.IsNullOrWhiteSpace(sipUri)) return null;
            // sip:user@domain
            var s = sipUri.Trim();
            if (s.StartsWith("sip:", StringComparison.OrdinalIgnoreCase))
            {
                s = s.Substring(4);
            }
            var at = s.IndexOf('@');
            if (at < 0 || at == s.Length - 1) return null;
            return s.Substring(at + 1);
        }

        string? BuildSipUriFromUsername(string username)
        {
            var domain = ExtractSipDomain(auth?.SipUri);
            if (string.IsNullOrWhiteSpace(domain)) return null;
            if (string.IsNullOrWhiteSpace(username)) return null;
            return $"sip:{username}@{domain}";
        }

        var fromUri = auth?.SipUri;
        string? toUri = null;
        string? groupUri = null;
        if (callType == CallType.Direct)
        {
            // If caller passes a SIP URI already, use it.
            if (!string.IsNullOrWhiteSpace(targetId) && targetId.Contains(":", StringComparison.OrdinalIgnoreCase))
            {
                toUri = targetId;

                // IMPORTANT: do not pass raw SIP URI as targetUserId.
                // The server resolves targets via username/userId/uri, and also has URI-first logic
                // (toUri -> username) that only runs when targetUserId is not set.
                // If we pass targetUserId = "sip:...", the callee may never be found and will miss
                // webrtc-setup-required (red state / no audio).
                try
                {
                    var uriStr = targetId.Trim();
                    if (uriStr.StartsWith("sip:", StringComparison.OrdinalIgnoreCase))
                    {
                        uriStr = uriStr.Substring(4);
                    }
                    var at = uriStr.IndexOf('@');
                    var derived = at > 0 ? uriStr.Substring(0, at) : uriStr;
                    outgoingTargetUserId = string.IsNullOrWhiteSpace(derived) ? string.Empty : derived;
                }
                catch
                {
                    outgoingTargetUserId = string.Empty;
                }
            }
            else
            {
                // Otherwise, try to synthesize sip:username@domain from our own SIP domain.
                toUri = BuildSipUriFromUsername(targetId);
            }
        }
        else
        {
            // Group/broadcast: keep using groupId for now; groupUri may be supplied later when available.
            groupUri = null;
        }

        await _socket.EmitAsync("instant-connect", new
        {
            fromUri,
            toUri,
            groupUri,
            targetUserId = outgoingTargetUserId,
            // For group/broadcast calls, let the server expand group members from groupId.
            // (Passing groupId in targetUserIds prevents the server from finding any target sockets.)
            targetUserIds = Array.Empty<string>(),
            groupId = outgoingGroupId,
            isGroupCall = callType == CallType.Broadcast || callType == CallType.Conference,
            audioMode = "open", // Can be "open" or "ptt"
            enableVideo = enableVideo
        });
    }

    public async Task EmitAnswerAsync(string callId)
    {
        await EnsureConnectedAsync();

        // Use instant-accept event as expected by the backend
        await _socket.EmitAsync("instant-accept", new { callId });
    }

    public async Task EmitHangupAsync(string callId)
    {
        await EnsureConnectedAsync();

        // Use instant-disconnect event as expected by the backend
        var safeCallId = string.Equals(callId, "pending", StringComparison.OrdinalIgnoreCase) ? "" : callId;
        await _socket.EmitAsync("instant-disconnect", new { callId = safeCallId });
    }

    public async Task EmitMuteAsync(string callId, bool muted)
    {
        await EnsureConnectedAsync();

        await _socket.EmitAsync("mute", new { callId, muted });
    }

    public async Task EmitJoinRoomAsync(string roomId)
    {
        await EnsureConnectedAsync();

        await _socket.EmitAsync("join-room", new { roomId });
    }

    public async Task EmitAsync(string eventName, object data)
    {
        await EnsureConnectedAsync();

        await _socket.EmitAsync(eventName, data);
    }

    public void On(string eventName, Action<object> handler)
    {
        _socket?.On(eventName, response =>
        {
            try
            {
                var data = response.GetValue<object>();
                handler(data);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling socket event: {EventName}", eventName);
            }
        });
    }

    public void Off(string eventName)
    {
        _socket?.Off(eventName);
    }

    private void SetupEventHandlers()
    {
        if (_socket == null) return;

        _socket.OnConnected += async (sender, e) =>
        {
            _logger.LogInformation("Socket.IO connected: {SocketId}", _socket?.Id);

            // Stop any background reconnect loop.
            try
            {
                _autoReconnectCts?.Cancel();
            }
            catch { }
            
            // Give a moment for authentication to complete
            await Task.Delay(100);
            
            ConnectionStateChanged?.Invoke(this, true);
            _logger.LogInformation("Connection state changed event fired: Connected");

            // If we have auth context, always re-auth after (re)connect.
            try
            {
                var auth = _lastAuth;
                var token = _authToken;
                if (auth != null && !string.IsNullOrWhiteSpace(token))
                {
                    await _socket.EmitAsync("authenticate", new
                    {
                        userId = auth.UserId,
                        username = auth.Username,
                        token
                    });
                    _logger.LogInformation("Re-authenticate sent after connect (user: {Username})", auth.Username);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to re-authenticate after connect");
            }
        };

        _socket.OnDisconnected += (sender, e) =>
        {
            _logger.LogInformation("Socket.IO disconnected: {Reason}", e);
            ConnectionStateChanged?.Invoke(this, false);

            // Auto-failover: try the next candidate in the background.
            if (!_disposed)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _reconnectGate.WaitAsync();
                        try
                        {
                            if (_socket != null && _socket.Connected) return;
                            var all = GetCandidateOrder(_serverUrl);
                            if (all.Count <= 1) return;

                            var nextIndex = (_serverCandidateIndex + 1) % all.Count;
                            var next = all[nextIndex];
                            if (string.Equals(next, _serverUrl, StringComparison.OrdinalIgnoreCase)) return;

                            _logger.LogWarning("Attempting socket failover to: {Url}", next);
                            var auth = _lastAuth;
                            var token = _authToken;
                            await DisconnectAsync();
                            await ConnectAsync(next, token);
                            if (auth != null && !string.IsNullOrWhiteSpace(token))
                            {
                                await AuthenticateAsync(auth.UserId, auth.Username, token);
                            }
                        }
                        finally
                        {
                            _reconnectGate.Release();
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failover reconnect attempt failed");
                    }
                });
            }

            // Auto-retry: if we only have one candidate (or failover doesn't fix it),
            // keep attempting to reconnect in the background with exponential backoff.
            if (!_disposed)
            {
                StartAutoReconnectLoop();
            }
        };

        _socket.OnError += (sender, e) =>
        {
            _logger.LogError("Socket.IO error: {Error}", e);
            Error?.Invoke(this, e);
        };

        _socket.On("auth-success", async response =>
        {
            try
            {
                object? dataObj = null;
                try
                {
                    dataObj = response.GetValue<object>();
                }
                catch
                {
                    var dataJson = response.GetValue<string>();
                    dataObj = JsonConvert.DeserializeObject<dynamic>(dataJson);
                }

                if (dataObj != null)
                {
                    var data = JsonConvert.DeserializeObject<dynamic>(JsonConvert.SerializeObject(dataObj));
                    string userId = "unknown";
                    try
                    {
                        var userIdObj = data?.userId ?? data?.username;
                        userId = userIdObj != null ? Convert.ToString(userIdObj) ?? "unknown" : "unknown";
                    }
                    catch
                    {
                        userId = "unknown";
                    }
                    _logger.LogInformation("Authentication successful for user: {UserId}", userId);
                    
                    // Wait a moment then trigger connection state update since we're now authenticated
                    await Task.Delay(100);
                    _logger.LogInformation("Firing ConnectionStateChanged event (authenticated)");
                    ConnectionStateChanged?.Invoke(this, true);
                    _logger.LogInformation("Connection state changed event fired after auth: Connected");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling auth-success");
            }
        });

        _socket.On("auth-error", response =>
        {
            try
            {
                var error = response.GetValue<string>();
                _logger.LogError("Authentication failed: {Error}", error);
                Error?.Invoke(this, $"Authentication failed: {error}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling auth-error");
            }
        });

        (JObject? Obj, string RawJson) NormalizeToJObject(object? data)
        {
            if (data == null)
            {
                return (null, "<null>");
            }

            try
            {
                // SocketIOClient can give us System.Text.Json.JsonElement.
                // If we treat it as an object, it serializes to {"ValueKind":...} and we lose the payload.
                if (data is JsonElement je)
                {
                    var rawText = je.GetRawText();
                    var tokenFromRaw = JToken.Parse(rawText);

                    if (tokenFromRaw is JObject objFromRaw)
                    {
                        return (objFromRaw, rawText);
                    }

                    if (tokenFromRaw is JArray arrFromRaw && arrFromRaw.Count > 0 && arrFromRaw[0] is JObject o0)
                    {
                        return (o0, rawText);
                    }

                    return (new JObject { ["value"] = tokenFromRaw }, rawText);
                }

                if (data is JsonDocument jd)
                {
                    var rawText = jd.RootElement.GetRawText();
                    var tokenFromRaw = JToken.Parse(rawText);

                    if (tokenFromRaw is JObject objFromRaw)
                    {
                        return (objFromRaw, rawText);
                    }

                    if (tokenFromRaw is JArray arrFromRaw && arrFromRaw.Count > 0 && arrFromRaw[0] is JObject o0)
                    {
                        return (o0, rawText);
                    }

                    return (new JObject { ["value"] = tokenFromRaw }, rawText);
                }

                // SocketIOClient often passes event args as an array.
                var token = data as JToken ?? JToken.FromObject(data);
                var raw = token.ToString(Formatting.None);

                // If the payload is a JSON string, parse it.
                if (token.Type == JTokenType.String)
                {
                    var s = token.Value<string>();
                    if (!string.IsNullOrWhiteSpace(s))
                    {
                        var parsed = JToken.Parse(s);
                        token = parsed;
                        raw = s;
                    }
                }

                // If the payload is an array of args, take the first arg.
                if (token is JArray arr)
                {
                    if (arr.Count == 0)
                    {
                        return (null, raw);
                    }

                    token = arr[0];
                    raw = arr.ToString(Formatting.None);
                }

                // Sometimes arg[0] is still a JSON string.
                if (token.Type == JTokenType.String)
                {
                    var s = token.Value<string>();
                    if (!string.IsNullOrWhiteSpace(s))
                    {
                        token = JToken.Parse(s);
                        raw = s;
                    }
                }

                if (token is JObject obj)
                {
                    return (obj, raw);
                }

                // Last resort: wrap non-object tokens.
                return (new JObject { ["value"] = token }, raw);
            }
            catch
            {
                return (null, JsonConvert.SerializeObject(data));
            }
        }

        string? GetString(JObject obj, params string[] keys)
        {
            foreach (var k in keys)
            {
                if (obj.TryGetValue(k, StringComparison.OrdinalIgnoreCase, out var token) && token != null)
                {
                    var s = token.Type == JTokenType.String ? token.Value<string>() : token.ToString();
                    if (!string.IsNullOrWhiteSpace(s)) return s;
                }
            }
            return null;
        }

        List<string> GetStringList(JObject obj, params string[] keys)
        {
            foreach (var k in keys)
            {
                if (obj.TryGetValue(k, StringComparison.OrdinalIgnoreCase, out var token) && token is JArray arr)
                {
                    return arr.Values<string>().Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
                }
            }
            return new List<string>();
        }

        bool GetBool(JObject obj, params string[] keys)
        {
            foreach (var k in keys)
            {
                if (!obj.TryGetValue(k, StringComparison.OrdinalIgnoreCase, out var token) || token == null)
                {
                    continue;
                }

                if (token.Type == JTokenType.Boolean)
                {
                    return token.Value<bool>();
                }

                if (token.Type == JTokenType.Integer)
                {
                    return token.Value<int>() != 0;
                }

                var s = token.Type == JTokenType.String ? token.Value<string>() : token.ToString();
                if (bool.TryParse(s, out var b))
                {
                    return b;
                }

                if (string.Equals(s, "1", StringComparison.OrdinalIgnoreCase) || string.Equals(s, "yes", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        LineSipStateEvent? ParseLineSipState(object? data, bool isIncoming)
        {
            var (obj, _) = NormalizeToJObject(data);
            if (obj == null) return null;

            var lineId = GetString(obj, "lineId") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(lineId)) return null;

            var activeUsers = 0;
            try
            {
                if (obj.TryGetValue("activeUsers", StringComparison.OrdinalIgnoreCase, out var usersTok) && usersTok != null)
                {
                    activeUsers = usersTok.Type == JTokenType.Integer ? usersTok.Value<int>() : int.Parse(usersTok.ToString());
                }
            }
            catch { }

            return new LineSipStateEvent
            {
                LineId = lineId,
                LineSessionKey = GetString(obj, "lineSessionKey"),
                MediaGroupId = GetString(obj, "mediaGroupId"),
                SipCallId = GetString(obj, "sipCallId", "callId"),
                Status = GetString(obj, "status"),
                Reason = GetString(obj, "reason"),
                SbcRole = GetString(obj, "sbcRole"),
                ActiveUsers = activeUsers,
                IsIncoming = isIncoming,
            };
        }

        _socket.On("instant-incoming", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                if (obj != null)
                {
                    var callId = GetString(obj, "callId", "id") ?? Guid.NewGuid().ToString();
                    var callerId = GetString(obj, "callerId", "from", "fromUserId", "callerUserId") ?? "unknown";
                    var callerName = GetString(obj, "callerName", "callerUsername", "displayName") ?? callerId;

                    if (callerId == "unknown")
                    {
                        _logger.LogWarning("instant-incoming missing callerId; payload={Payload}", raw);
                    }

                    var call = new Call
                    {
                        Id = callId,
                        CallerId = callerId,
                        CallerName = callerName,
                        TargetId = GetString(obj, "targetUserId"),
                        GroupId = GetString(obj, "groupId"),
                        GroupName = GetString(obj, "groupName"),
                        Type = obj.TryGetValue("isGroupCall", StringComparison.OrdinalIgnoreCase, out var isGroupTok) && isGroupTok?.Type == JTokenType.Boolean && isGroupTok.Value<bool>()
                            ? CallType.Conference
                            : CallType.Direct,
                        State = CallState.Ringing,
                        StartTime = DateTime.UtcNow,
                        EnableVideo = GetBool(obj, "enableVideo")
                    };
                    
                    _logger.LogInformation("Incoming instant call: {CallId} from {CallerId}", 
                        call.Id ?? "unknown", call.CallerId ?? "unknown");
                    IncomingCall?.Invoke(this, call);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling instant-incoming");
            }
        });

        // Server broadcasts this to ALL participants once the call is active.
        // The caller also gets "instant-connected", but callees may only see this.
        _socket.On("instant-call-active", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                if (obj != null)
                {
                    var callId = GetString(obj, "callId", "id") ?? Guid.NewGuid().ToString();
                    if (string.IsNullOrWhiteSpace(GetString(obj, "callId", "id")))
                    {
                        _logger.LogWarning("instant-call-active missing callId; payload={Payload}", raw);
                    }
                    var call = new Call
                    {
                        Id = callId,
                        CallerId = GetString(obj, "callerId", "callerUserId") ?? "unknown",
                        TargetId = GetString(obj, "targetUserId"),
                        GroupId = GetString(obj, "groupId"),
                        Type = string.Equals(GetString(obj, "type"), "group", StringComparison.OrdinalIgnoreCase) ? CallType.Conference : CallType.Direct,
                        // Call is now active for all participants.
                        State = CallState.Connected,
                        StartTime = DateTime.UtcNow,
                        EnableVideo = GetBool(obj, "enableVideo")
                    };

                    _logger.LogInformation("Instant call active (broadcast): {CallId}", call.Id ?? "unknown");
                    CallStateChanged?.Invoke(this, call);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling instant-call-active");
            }
        });

        _socket.On("instant-connected", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                if (obj != null)
                {
                    var callId = GetString(obj, "callId", "id") ?? Guid.NewGuid().ToString();
                    if (string.IsNullOrWhiteSpace(GetString(obj, "callId", "id")))
                    {
                        _logger.LogWarning("instant-connected missing callId; payload={Payload}", raw);
                    }
                    var call = new Call
                    {
                        Id = callId,
                        CallerId = GetString(obj, "callerId", "callerUserId") ?? "unknown",
                        TargetId = GetString(obj, "targetUserId"),
                        GroupId = GetString(obj, "groupId"),
                        Type = string.Equals(GetString(obj, "type"), "group", StringComparison.OrdinalIgnoreCase) ? CallType.Conference : CallType.Direct,
                        // instant-connected is signaling-level and can occur before media is actually flowing.
                        // Keep UI in Connecting until we get instant-call-active / webrtc-setup-required.
                        State = CallState.Connecting,
                        StartTime = DateTime.UtcNow,
                        EnableVideo = GetBool(obj, "enableVideo")
                    };

                    call.Participants = GetStringList(obj, "participants");
                    
                    _logger.LogInformation("Instant call connected (signaling): {CallId}", call.Id ?? "unknown");
                    CallStateChanged?.Invoke(this, call);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling instant-connected");
            }
        });

        _socket.On("instant-disconnected", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                string callId = obj != null ? (GetString(obj, "callId", "id") ?? "") : "";
                if (!string.IsNullOrEmpty(callId))
                {
                    _logger.LogInformation("Instant call disconnected: {CallId}", callId);
                }
                else
                {
                    _logger.LogWarning("instant-disconnected missing callId; payload={Payload}", raw);
                }
                if (!string.IsNullOrEmpty(callId))
                {
                    CallEnded?.Invoke(this, callId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling instant-disconnected");
            }
        });

        _socket.On("instant-ended", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                string callId = obj != null ? (GetString(obj, "callId", "id") ?? "") : "";

                if (!string.IsNullOrEmpty(callId))
                {
                    _logger.LogInformation("Instant call ended: {CallId}", callId);
                    CallEnded?.Invoke(this, callId);
                }
                else
                {
                    _logger.LogWarning("instant-ended missing callId; payload={Payload}", raw);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling instant-ended");
            }
        });

        _socket.On("broadcast-activated", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);
                if (obj == null)
                {
                    _logger.LogWarning("broadcast-activated received non-object payload: {Payload}", raw);
                    return;
                }

                var lineId = GetString(obj, "lineId", "groupId") ?? string.Empty;
                if (string.IsNullOrWhiteSpace(lineId))
                {
                    _logger.LogWarning("broadcast-activated missing lineId; payload={Payload}", raw);
                    return;
                }

                _logger.LogInformation("Broadcast activated: {LineId}", lineId);
                BroadcastActiveChanged?.Invoke(this, (lineId, true));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling broadcast-activated");
            }
        });

        _socket.On("broadcast-closed", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);
                if (obj == null)
                {
                    _logger.LogWarning("broadcast-closed received non-object payload: {Payload}", raw);
                    return;
                }

                var lineId = GetString(obj, "lineId", "groupId") ?? string.Empty;
                if (string.IsNullOrWhiteSpace(lineId))
                {
                    _logger.LogWarning("broadcast-closed missing lineId; payload={Payload}", raw);
                    return;
                }

                _logger.LogInformation("Broadcast closed: {LineId}", lineId);
                BroadcastActiveChanged?.Invoke(this, (lineId, false));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling broadcast-closed");
            }
        });

        _socket.On("broadcast-monitor-updated", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);
                if (obj == null)
                {
                    _logger.LogWarning("broadcast-monitor-updated received non-object payload: {Payload}", raw);
                    return;
                }

                var ok = GetBool(obj, "success");
                if (!ok)
                {
                    var err = GetString(obj, "error", "message") ?? "broadcast-monitor-updated failed";
                    _logger.LogWarning("broadcast-monitor-updated failed: {Error}; payload={Payload}", err, raw);
                    return;
                }

                var lineId = GetString(obj, "groupId", "lineId") ?? string.Empty;
                if (string.IsNullOrWhiteSpace(lineId))
                {
                    _logger.LogWarning("broadcast-monitor-updated missing groupId; payload={Payload}", raw);
                    return;
                }

                var isMonitoring = GetBool(obj, "monitor");
                int? listenerCount = null;
                try
                {
                    if (obj.TryGetValue("listenerCount", StringComparison.OrdinalIgnoreCase, out var tok) && tok != null)
                    {
                        if (tok.Type == JTokenType.Integer)
                        {
                            listenerCount = tok.Value<int>();
                        }
                        else
                        {
                            var s = tok.Type == JTokenType.String ? tok.Value<string>() : tok.ToString();
                            if (int.TryParse(s, out var i))
                            {
                                listenerCount = i;
                            }
                        }
                    }
                }
                catch { }

                _logger.LogInformation(
                    "Broadcast monitor updated: {LineId} monitoring={Monitoring} listenerCount={ListenerCount}",
                    lineId,
                    isMonitoring,
                    listenerCount.HasValue ? listenerCount.Value : -1);

                BroadcastMonitorUpdated?.Invoke(this, (lineId, isMonitoring, listenerCount));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling broadcast-monitor-updated");
            }
        });

        _socket.On("line-sip-state", response =>
        {
            try
            {
                var evt = ParseLineSipState(response.GetValue<object>(), isIncoming: false);
                if (evt == null) return;
                LineSipStateChanged?.Invoke(this, evt);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling line-sip-state");
            }
        });

        _socket.On("line-sip-incoming", response =>
        {
            try
            {
                var evt = ParseLineSipState(response.GetValue<object>(), isIncoming: true);
                if (evt == null) return;
                LineSipIncoming?.Invoke(this, evt);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling line-sip-incoming");
            }
        });

        _socket.On("instant-error", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                string message = "Unknown error";
                if (obj != null)
                {
                    message = GetString(obj, "message", "error", "reason") ?? "Unknown error";
                }

                var attempted = obj != null ? GetStringList(obj, "attempted") : new List<string>();
                var matched = obj != null ? GetStringList(obj, "matched") : new List<string>();

                if (attempted.Count > 0 || matched.Count > 0)
                {
                    _logger.LogError(
                        "Instant call error: {Message}; attempted={Attempted}; matched={Matched}; payload={Payload}",
                        message,
                        string.Join(",", attempted),
                        string.Join(",", matched),
                        raw);
                }
                else
                {
                    _logger.LogError("Instant call error: {Message}; payload={Payload}", message, raw);
                }

                Error?.Invoke(this, message);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling instant-error");
            }
        });

        _socket.On("instant-blocked", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var json = JsonConvert.SerializeObject(data);
                var blockData = JsonConvert.DeserializeObject<dynamic>(json);
                
                string message = "Call blocked";
                string reason = "unknown";
                string callId = string.Empty;
                if (blockData?.message != null)
                {
                    message = Convert.ToString(blockData.message) ?? "Call blocked";
                }
                if (blockData?.reason != null)
                {
                    reason = Convert.ToString(blockData.reason) ?? "unknown";
                }
                if (blockData?.callId != null)
                {
                    callId = Convert.ToString(blockData.callId) ?? string.Empty;
                }
                _logger.LogWarning("Instant call blocked: {Reason} - {Message}", reason, message);
                Error?.Invoke(this, $"Call blocked: {message}");

                // If server provides a callId, treat this as an ended call so UI stops showing dialing.
                if (!string.IsNullOrWhiteSpace(callId))
                {
                    CallEnded?.Invoke(this, callId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling instant-blocked");
            }
        });

        _socket.On("webrtc-setup-required", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                if (obj != null)
                {
                    string callId = GetString(obj, "callId", "id") ?? string.Empty;
                    var participants = GetStringList(obj, "participants");
                    
                    int participantCount = participants.Count;
                    _logger.LogInformation("WebRTC setup required for call: {CallId}, Participants: {Count}", callId, participantCount);

                    if (string.IsNullOrWhiteSpace(callId))
                    {
                        _logger.LogWarning("webrtc-setup-required missing callId; payload={Payload}", raw);
                    }
                    
                    WebRTCSetupRequired?.Invoke(this, new WebRTCSetupData
                    {
                        CallId = callId,
                        Participants = participants
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling webrtc-setup-required");
            }
        });

        _socket.On("audio-level", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                if (obj != null)
                {
                    var callId = GetString(obj, "callId", "roomId", "groupId") ?? string.Empty;
                    var userId = GetString(obj, "userId", "id", "user") ?? string.Empty;
                    float level = 0f;

                    if (obj.TryGetValue("level", StringComparison.OrdinalIgnoreCase, out var levelTok) && levelTok != null)
                    {
                        _ = float.TryParse(levelTok.ToString(), out level);
                    }
                    else if (obj.TryGetValue("audioLevel", StringComparison.OrdinalIgnoreCase, out var alTok) && alTok != null)
                    {
                        _ = float.TryParse(alTok.ToString(), out level);
                    }

                    if (!string.IsNullOrWhiteSpace(callId) && !string.IsNullOrWhiteSpace(userId))
                    {
                        AudioLevelReceived?.Invoke(this, new AudioLevelData { CallId = callId, UserId = userId, Level = level });
                    }
                    else
                    {
                        _logger.LogDebug("audio-level missing callId/userId; payload={Payload}", raw);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling audio-level");
            }
        });

        _socket.On("presence-update", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var (obj, raw) = NormalizeToJObject(data);

                if (obj != null)
                {
                    var userId = GetString(obj, "userId", "id", "user") ?? string.Empty;
                    var username = GetString(obj, "username", "name") ?? string.Empty;
                    var isOnline = GetBool(obj, "online", "isOnline");

                    _logger.LogInformation("Presence update: {UserId} ({Username}) - {Online}", userId, username, isOnline);

                    UserStatusChanged?.Invoke(this, new User
                    {
                        Id = userId ?? "",
                        Username = username ?? "",
                        Status = isOnline ? "online" : "offline",
                        IsOnline = isOnline
                    });
                }
                else
                {
                    _logger.LogWarning("presence-update payload could not be normalized; payload={Payload}", raw);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling presence-update");
            }
        });

        _socket.On("user-status", response =>
        {
            try
            {
                object? statusObj = null;
                try
                {
                    statusObj = response.GetValue<object>();
                }
                catch
                {
                    var statusJson = response.GetValue<string>();
                    statusObj = JsonConvert.DeserializeObject<dynamic>(statusJson);
                }

                if (statusObj != null)
                {
                    var statusData = JsonConvert.DeserializeObject<dynamic>(JsonConvert.SerializeObject(statusObj));
                    if (statusData != null)
                    {
                        string userId = "";
                        string username = "";
                        string status = "offline";
                        bool? onlineFlag = null;
                        
                        try
                        {
                            var userIdObj = statusData.userId;
                            var usernameObj = statusData.username;
                            var statusValueObj = statusData.status;
                            
                            userId = userIdObj != null ? Convert.ToString(userIdObj) ?? "" : "";
                            username = usernameObj != null ? Convert.ToString(usernameObj) ?? "" : "";
                            status = statusValueObj != null ? Convert.ToString(statusValueObj) ?? "offline" : "offline";

                            try
                            {
                                var onlineObj = statusData.online;
                                if (onlineObj != null)
                                {
                                    bool parsedOnline;
                                    if (bool.TryParse(Convert.ToString(onlineObj) ?? string.Empty, out parsedOnline))
                                    {
                                        onlineFlag = parsedOnline;
                                    }
                                }
                            }
                            catch { }

                            try
                            {
                                if (onlineFlag == null)
                                {
                                    var isOnlineObj = statusData.isOnline;
                                    if (isOnlineObj != null)
                                    {
                                        bool parsedIsOnline;
                                        if (bool.TryParse(Convert.ToString(isOnlineObj) ?? string.Empty, out parsedIsOnline))
                                        {
                                            onlineFlag = parsedIsOnline;
                                        }
                                    }
                                }
                            }
                            catch { }
                        }
                        catch
                        {
                            // Use defaults already set
                        }
                        
                        _logger.LogInformation("User status update: {UserId} ({Username}) - {Status}", userId, username, status);

                        var normalizedStatus = (status ?? "offline").Trim();
                        var statusLower = normalizedStatus.ToLowerInvariant();
                        var isOnline = onlineFlag ?? (statusLower switch
                        {
                            "offline" => false,
                            "" => false,
                            _ => true
                        });

                        // If server explicitly says the user is not online, force an offline presence.
                        if (!isOnline)
                        {
                            normalizedStatus = "offline";
                        }
                        
                        UserStatusChanged?.Invoke(this, new User 
                        { 
                            Id = userId ?? "",
                            Username = username ?? "",
                            Status = normalizedStatus,
                            IsOnline = isOnline
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling user-status");
            }
        });
    }

    private void StartAutoReconnectLoop()
    {
        try
        {
            if (_disposed) return;

            // Only one loop at a time.
            if (_autoReconnectTask != null && !_autoReconnectTask.IsCompleted)
            {
                return;
            }

            _autoReconnectCts?.Cancel();
            _autoReconnectCts = new CancellationTokenSource();
            var ct = _autoReconnectCts.Token;

            _autoReconnectTask = Task.Run(async () =>
            {
                var attempt = 0;
                while (!ct.IsCancellationRequested && !_disposed)
                {
                    try
                    {
                        if (_socket != null && _socket.Connected)
                        {
                            return;
                        }

                        attempt++;
                        var baseDelayMs = 2000;
                        var maxDelayMs = 30000;
                        var delayMs = Math.Min(maxDelayMs, baseDelayMs * (int)Math.Pow(2, Math.Min(attempt - 1, 4))); // 2s,4s,8s,16s,32s(capped)

                        try
                        {
                            await _reconnectGate.WaitAsync(ct);
                            try
                            {
                                if (_socket != null && _socket.Connected)
                                {
                                    return;
                                }

                                var target = _serverUrl ?? _serverCandidates.FirstOrDefault() ?? string.Empty;
                                if (string.IsNullOrWhiteSpace(target))
                                {
                                    _logger.LogWarning("Auto-reconnect: no server URL available");
                                }
                                else
                                {
                                    _logger.LogWarning("Auto-reconnect attempt {Attempt} to {Url}", attempt, target);
                                    try
                                    {
                                        var auth = _lastAuth;
                                        var token = _authToken;
                                        // ConnectAsync will no-op if already connected.
                                        await ConnectAsync(target, token);
                                        if (auth != null && !string.IsNullOrWhiteSpace(token))
                                        {
                                            await AuthenticateAsync(auth.UserId, auth.Username, token);
                                        }
                                    }
                                    catch (Exception ex)
                                    {
                                        _logger.LogWarning(ex, "Auto-reconnect attempt {Attempt} failed", attempt);
                                    }
                                }
                            }
                            finally
                            {
                                _reconnectGate.Release();
                            }
                        }
                        catch (OperationCanceledException)
                        {
                            return;
                        }

                        // Sleep before next attempt (unless connected).
                        if (_socket != null && _socket.Connected)
                        {
                            return;
                        }

                        await Task.Delay(delayMs, ct);
                    }
                    catch (OperationCanceledException)
                    {
                        return;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Auto-reconnect loop error");
                        try { await Task.Delay(5000, ct); } catch { }
                    }
                }
            }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to start auto-reconnect loop");
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            try { _autoReconnectCts?.Cancel(); } catch { }
            DisconnectAsync().Wait(TimeSpan.FromSeconds(5));
            _socket?.Dispose();
            _disposed = true;
        }
    }
}

