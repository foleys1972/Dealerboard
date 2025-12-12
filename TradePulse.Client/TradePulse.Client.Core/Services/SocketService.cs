using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Logging;
using SocketIOClient.Transport;
using TradePulse.Client.Core.Models;
using Newtonsoft.Json;
using System.Threading;
using System.Reflection;
using System.Linq;

namespace TradePulse.Client.Core.Services;

public class SocketService : ISocketService, IDisposable
{
    private readonly ILogger<SocketService> _logger;
    private SocketIOClient.SocketIO? _socket;
    private string? _authToken;
    private bool _disposed = false;

    public bool IsConnected => _socket?.Connected ?? false;
    public string? SocketId => _socket?.Id;

    public event EventHandler<bool>? ConnectionStateChanged;
    public event EventHandler<User>? UserStatusChanged;
    public event EventHandler<Call>? IncomingCall;
    public event EventHandler<Call>? CallStateChanged;
    public event EventHandler<string>? CallEnded;
    public event EventHandler<WebRTCSetupData>? WebRTCSetupRequired;
    public event EventHandler<string>? Error;

    public SocketService(ILogger<SocketService> logger)
    {
        _logger = logger;
    }

    public async Task ConnectAsync(string serverUrl, string? token = null)
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
                Transport = TransportProtocol.Polling, // Match React client: polling only
                Reconnection = true,
                ReconnectionDelay = 2000,
                ReconnectionDelayMax = 10000,
                ReconnectionAttempts = 10,
                ConnectionTimeout = TimeSpan.FromSeconds(30), // Match React client timeout (30s)
                ExtraHeaders = token != null 
                    ? new Dictionary<string, string> { { "Authorization", $"Bearer {token}" } }
                    : null
            };
            
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
                _logger.LogInformation("Server connectivity test: Status={Status}, ReasonPhrase={ReasonPhrase}", 
                    testResponse.StatusCode, testResponse.ReasonPhrase);
                
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
                try
                {
                    var socketType = _socket.GetType();
                    var searchedObjects = new HashSet<object>();
                    
                    // Recursive function to find ALL HttpClient instances (not just the first one)
                    void SearchForAllHttpClients(object? obj, int depth = 0)
                    {
                        if (obj == null || depth > 5 || searchedObjects.Contains(obj)) return;
                        searchedObjects.Add(obj);
                        
                        if (obj is HttpClient hc)
                        {
                            foundHttpClients.Add(hc);
                            // Don't return - keep searching for more!
                        }
                        
                        var objType = obj.GetType();
                        
                        // Search all fields
                        var fields = objType.GetFields(BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public | BindingFlags.Static);
                        foreach (var field in fields)
                        {
                            try
                            {
                                var value = field.GetValue(obj);
                                if (value is HttpClient hc2)
                                {
                                    foundHttpClients.Add(hc2);
                                }
                                if (value != null && !value.GetType().IsPrimitive && !(value is string))
                                {
                                    SearchForAllHttpClients(value, depth + 1);
                                }
                            }
                            catch { }
                        }
                        
                        // Search all properties
                        var props = objType.GetProperties(BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public | BindingFlags.Static);
                        foreach (var prop in props)
                        {
                            try
                            {
                                if (prop.GetIndexParameters().Length > 0) continue;
                                var value = prop.GetValue(obj);
                                if (value is HttpClient hc3)
                                {
                                    foundHttpClients.Add(hc3);
                                }
                                if (value != null && !value.GetType().IsPrimitive && !(value is string))
                                {
                                    SearchForAllHttpClients(value, depth + 1);
                                }
                            }
                            catch { }
                        }
                    }
                    
                    _logger.LogInformation("Starting ULTRA-DEEP recursive search for ALL HttpClient instances in SocketIOClient library...");
                    SearchForAllHttpClients(_socket);
                    
                    // Remove duplicates (same instance found multiple times)
                    foundHttpClients = foundHttpClients.Distinct().ToList();
                    
                    if (foundHttpClients.Count > 0)
                    {
                        _logger.LogInformation("Found {Count} HttpClient instance(s) - overriding ALL of them!", foundHttpClients.Count);
                        foreach (var hc in foundHttpClients)
                        {
                            var oldTimeout = hc.Timeout;
                            hc.Timeout = TimeSpan.FromSeconds(30);
                            _logger.LogInformation("✅ Overrode HttpClient timeout from {OldTimeout} to 30 seconds (HashCode: {HashCode})", 
                                oldTimeout, hc.GetHashCode());
                        }
                        _logger.LogInformation("🎉🎉🎉 SUCCESS! Overrode {Count} HttpClient instance(s) to 30 seconds!", foundHttpClients.Count);
                    }
                    else
                    {
                        _logger.LogError("❌ No HttpClient instances found. Library structure is different than expected.");
                    }
                }
                catch (Exception reflectionEx)
                {
                    _logger.LogError(reflectionEx, "Recursive reflection search failed: {Error}", reflectionEx.Message);
                }
                
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

            _logger.LogInformation("Attempting Socket.IO connection with polling transport (matching React client exactly)...");
            
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
                        SetupEventHandlers();
                        _logger.LogInformation("Recreated Socket.IO client for retry attempt {Attempt}", attempt);
                    }
                    
                    // CRITICAL: Override HttpClient timeouts BEFORE calling ConnectAsync
                    // The library starts HTTP requests immediately, so we must override BEFORE ConnectAsync()
                    _logger.LogInformation("🔍 Checking for HttpClient instances BEFORE ConnectAsync starts...");
                    var httpClientsBeforeConnect = new List<HttpClient>();
                    try
                    {
                        var socketType = _socket.GetType();
                        var searchedObjects = new HashSet<object>();
                        
                        void FindAllHttpClientsBeforeConnect(object? obj, int depth = 0)
                        {
                            if (obj == null || depth > 5 || searchedObjects.Contains(obj)) return;
                            searchedObjects.Add(obj);
                            
                            if (obj is HttpClient hc && !httpClientsBeforeConnect.Contains(hc))
                            {
                                httpClientsBeforeConnect.Add(hc);
                            }
                            
                            var objType = obj.GetType();
                            var fields = objType.GetFields(BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public | BindingFlags.Static);
                            foreach (var field in fields)
                            {
                                try
                                {
                                    var value = field.GetValue(obj);
                                    if (value is HttpClient hc2 && !httpClientsBeforeConnect.Contains(hc2))
                                    {
                                        httpClientsBeforeConnect.Add(hc2);
                                    }
                                    if (value != null && !value.GetType().IsPrimitive && !(value is string))
                                    {
                                        FindAllHttpClientsBeforeConnect(value, depth + 1);
                                    }
                                }
                                catch { }
                            }
                        }
                        
                        FindAllHttpClientsBeforeConnect(_socket);
                        httpClientsBeforeConnect = httpClientsBeforeConnect.Distinct().ToList();
                        
                        if (httpClientsBeforeConnect.Count > 0)
                        {
                            _logger.LogInformation("🔍 Found {Count} HttpClient instance(s) BEFORE ConnectAsync - OVERRIDING ALL NOW!", httpClientsBeforeConnect.Count);
                            int successCount = 0;
                            int failureCount = 0;
                            
                            foreach (var hc in httpClientsBeforeConnect)
                            {
                                try
                                {
                                    var oldTimeout = hc.Timeout;
                                    var baseAddress = hc.BaseAddress?.ToString() ?? "null";
                                    var hashCode = hc.GetHashCode();
                                    
                                    _logger.LogInformation("  📋 Overriding HttpClient (HashCode: {HashCode}, BaseAddress: {BaseAddress}, CurrentTimeout: {CurrentTimeout})...", 
                                        hashCode, baseAddress, oldTimeout);
                                    
                                    hc.Timeout = TimeSpan.FromSeconds(30);
                                    _logger.LogInformation("  ✅ SUCCESS! Overrode HttpClient timeout: {OldTimeout} -> 30s (HashCode: {HashCode})", 
                                        oldTimeout, hashCode);
                                    successCount++;
                                }
                                catch (Exception hcEx)
                                {
                                    _logger.LogWarning(hcEx, "  ⚠️  Could not override HttpClient timeout (HashCode: {HashCode}): {Error}", 
                                        hc.GetHashCode(), hcEx.Message);
                                    failureCount++;
                                }
                            }
                            
                            _logger.LogInformation("📊 Pre-ConnectAsync override summary: {SuccessCount} succeeded, {FailureCount} failed out of {TotalCount}", 
                                successCount, failureCount, httpClientsBeforeConnect.Count);
                        }
                        else
                        {
                            _logger.LogWarning("⚠️  No HttpClient instances found BEFORE ConnectAsync - library may create them during ConnectAsync");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to search for HttpClient before ConnectAsync: {Error}", ex.Message);
                    }
                    
                    // Start connection - library will timeout at 10 seconds (but we overrode it to 30s)
                    _logger.LogInformation("🚀 Calling _socket.ConnectAsync() now...");
                    var connectTask = _socket.ConnectAsync();
                    _logger.LogInformation("✅ ConnectAsync() task created (Status: {Status})", connectTask.Status);
                    
                    // CRITICAL: Check for NEW HttpClient instances created during ConnectAsync
                    // The library might create a new HttpClient when ConnectAsync starts
                    _logger.LogInformation("⏳ Waiting 100ms for library to initialize HttpClient instances...");
                    await Task.Delay(100); // Reduced delay to catch them earlier
                    
                    var httpClientsDuringConnect = new List<HttpClient>();
                    try
                    {
                        var socketType = _socket.GetType();
                        var searchedObjects = new HashSet<object>();
                        int searchDepth = 0;
                        int totalObjectsSearched = 0;
                        
                        void FindAllHttpClientsDuringConnect(object? obj, int depth = 0)
                        {
                            if (obj == null || depth > 5 || searchedObjects.Contains(obj)) return;
                            searchedObjects.Add(obj);
                            totalObjectsSearched++;
                            if (depth > searchDepth) searchDepth = depth;
                            
                            if (obj is HttpClient hc && !httpClientsDuringConnect.Contains(hc))
                            {
                                httpClientsDuringConnect.Add(hc);
                            }
                            
                            var objType = obj.GetType();
                            var fields = objType.GetFields(BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Public | BindingFlags.Static);
                            foreach (var field in fields)
                            {
                                try
                                {
                                    var value = field.GetValue(obj);
                                    if (value is HttpClient hc2 && !httpClientsDuringConnect.Contains(hc2))
                                    {
                                        httpClientsDuringConnect.Add(hc2);
                                    }
                                    if (value != null && !value.GetType().IsPrimitive && !(value is string))
                                    {
                                        FindAllHttpClientsDuringConnect(value, depth + 1);
                                    }
                                }
                                catch { }
                            }
                        }
                        
                        _logger.LogInformation("🔍 Starting deep search for HttpClient instances DURING ConnectAsync...");
                        FindAllHttpClientsDuringConnect(_socket);
                        httpClientsDuringConnect = httpClientsDuringConnect.Distinct().ToList();
                        
                        _logger.LogInformation("🔍 Search complete - Searched {TotalObjects} objects at max depth {MaxDepth}", totalObjectsSearched, searchDepth);
                        
                        if (httpClientsDuringConnect.Count > 0)
                        {
                            _logger.LogInformation("🎯 Found {Count} HttpClient instance(s) DURING ConnectAsync - attempting to override ALL!", httpClientsDuringConnect.Count);
                            
                            int successCount = 0;
                            int failureCount = 0;
                            
                            foreach (var hc in httpClientsDuringConnect)
                            {
                                try
                                {
                                    var oldTimeout = hc.Timeout;
                                    var baseAddress = hc.BaseAddress?.ToString() ?? "null";
                                    var hashCode = hc.GetHashCode();
                                    
                                    _logger.LogInformation("  📋 Attempting to override HttpClient (HashCode: {HashCode}, BaseAddress: {BaseAddress}, CurrentTimeout: {CurrentTimeout})...", 
                                        hashCode, baseAddress, oldTimeout);
                                    
                                    // Check if this HttpClient was already found before ConnectAsync
                                    var wasFoundBefore = httpClientsBeforeConnect.Any(h => h.GetHashCode() == hashCode);
                                    if (wasFoundBefore)
                                    {
                                        _logger.LogInformation("  ⚠️  This HttpClient was already found BEFORE ConnectAsync - may have started requests");
                                    }
                                    
                                    hc.Timeout = TimeSpan.FromSeconds(30);
                                    _logger.LogInformation("  ✅ SUCCESS! Overrode HttpClient timeout: {OldTimeout} -> 30s (HashCode: {HashCode})", 
                                        oldTimeout, hashCode);
                                    successCount++;
                                }
                                catch (Exception hcEx)
                                {
                                    _logger.LogError(hcEx, "  ❌ FAILED to override HttpClient timeout (HashCode: {HashCode}): {Error}", 
                                        hc.GetHashCode(), hcEx.Message);
                                    failureCount++;
                                }
                            }
                            
                            _logger.LogInformation("📊 HttpClient override summary: {SuccessCount} succeeded, {FailureCount} failed out of {TotalCount}", 
                                successCount, failureCount, httpClientsDuringConnect.Count);
                        }
                        else
                        {
                            _logger.LogWarning("⚠️  No HttpClient instances found DURING ConnectAsync - this is unexpected!");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "❌ Failed to search for HttpClient during ConnectAsync: {Error}", ex.Message);
                    }
                    
                    // Wait up to 35 seconds (30s overridden timeout + 5s buffer)
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
                                        
                                        // Try to override it if it hasn't started
                                        try
                                        {
                                            var oldTimeout = hc.Timeout;
                                            hc.Timeout = TimeSpan.FromSeconds(30);
                                            _logger.LogInformation("      ✅ Overrode DefaultHttpClient's internal HttpClient timeout: {OldTimeout} -> 30s", oldTimeout);
                                        }
                                        catch (Exception overrideEx)
                                        {
                                            _logger.LogWarning(overrideEx, "      ⚠️  Could not override DefaultHttpClient's internal HttpClient: {Error}", overrideEx.Message);
                                        }
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
                        _logger.LogError(connectEx, "❌ ConnectAsync threw exception for attempt {Attempt}: {Error}", attempt, connectEx.Message);
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
            _logger.LogError(ex, "Failed to connect to Socket.IO server: {Url}. Exception Type: {Type}, Error: {Error}", 
                socketUrl, ex.GetType().Name, errorMessage);
            Error?.Invoke(this, errorMessage);
            throw;
        }
    }

    public async Task DisconnectAsync()
    {
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
        if (_socket == null || !_socket.Connected)
        {
            throw new InvalidOperationException("Socket not connected");
        }

        try
        {
            _authToken = token;
            
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
        if (_socket == null || !_socket.Connected)
        {
            throw new InvalidOperationException("Socket not connected");
        }

        // Use instant-connect event as expected by the backend
        await _socket.EmitAsync("instant-connect", new
        {
            targetUserId = callType == CallType.Direct ? targetId : null,
            targetUserIds = callType != CallType.Direct ? new[] { targetId } : null,
            groupId = callType == CallType.Broadcast || callType == CallType.Conference ? targetId : null,
            isGroupCall = callType != CallType.Direct,
            audioMode = "open", // Can be "open" or "ptt"
            enableVideo = enableVideo
        });
    }

    public async Task EmitAnswerAsync(string callId)
    {
        if (_socket == null || !_socket.Connected)
        {
            throw new InvalidOperationException("Socket not connected");
        }

        // Use instant-accept event as expected by the backend
        await _socket.EmitAsync("instant-accept", new { callId });
    }

    public async Task EmitHangupAsync(string callId)
    {
        if (_socket == null || !_socket.Connected)
        {
            throw new InvalidOperationException("Socket not connected");
        }

        // Use instant-disconnect event as expected by the backend
        await _socket.EmitAsync("instant-disconnect", new { callId });
    }

    public async Task EmitMuteAsync(string callId, bool muted)
    {
        if (_socket == null || !_socket.Connected)
        {
            throw new InvalidOperationException("Socket not connected");
        }

        await _socket.EmitAsync("mute", new { callId, muted });
    }

    public async Task EmitJoinRoomAsync(string roomId)
    {
        if (_socket == null || !_socket.Connected)
        {
            throw new InvalidOperationException("Socket not connected");
        }

        await _socket.EmitAsync("join-room", new { roomId });
    }

    public async Task EmitAsync(string eventName, object data)
    {
        if (_socket == null || !_socket.Connected)
        {
            throw new InvalidOperationException("Socket not connected");
        }

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
            
            // Give a moment for authentication to complete
            await Task.Delay(100);
            
            ConnectionStateChanged?.Invoke(this, true);
            _logger.LogInformation("Connection state changed event fired: Connected");
        };

        _socket.OnDisconnected += (sender, e) =>
        {
            _logger.LogInformation("Socket.IO disconnected: {Reason}", e);
            ConnectionStateChanged?.Invoke(this, false);
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

        _socket.On("instant-incoming", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var json = JsonConvert.SerializeObject(data);
                var callData = JsonConvert.DeserializeObject<dynamic>(json);
                
                if (callData != null)
                {
                    var call = new Call
                    {
                        Id = callData.callId?.ToString() ?? Guid.NewGuid().ToString(),
                        CallerId = callData.callerId?.ToString(),
                        CallerName = callData.callerName?.ToString(),
                        TargetId = callData.targetUserId?.ToString(),
                        GroupId = callData.groupId?.ToString(),
                        GroupName = callData.groupName?.ToString(),
                        Type = callData.isGroupCall == true ? CallType.Conference : CallType.Direct,
                        State = CallState.Ringing,
                        StartTime = DateTime.UtcNow
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

        _socket.On("instant-connected", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var json = JsonConvert.SerializeObject(data);
                var callData = JsonConvert.DeserializeObject<dynamic>(json);
                
                if (callData != null)
                {
                    var call = new Call
                    {
                        Id = callData.callId?.ToString() ?? Guid.NewGuid().ToString(),
                        CallerId = callData.callerId?.ToString(),
                        TargetId = callData.targetUserId?.ToString(),
                        GroupId = callData.groupId?.ToString(),
                        Type = callData.type?.ToString() == "group" ? CallType.Conference : CallType.Direct,
                        State = CallState.Connected,
                        StartTime = DateTime.UtcNow
                    };
                    
                    // Parse participants if available
                    if (callData.participants != null)
                    {
                        var participantsJson = JsonConvert.SerializeObject(callData.participants);
                        var participants = JsonConvert.DeserializeObject<List<string>>(participantsJson);
                        if (participants != null)
                        {
                            call.Participants = participants;
                        }
                    }
                    
                    _logger.LogInformation("Instant call connected: {CallId}", call.Id ?? "unknown");
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
                var json = JsonConvert.SerializeObject(data);
                var callData = JsonConvert.DeserializeObject<dynamic>(json);
                
                string callId = "";
                if (callData?.callId != null)
                {
                    callId = Convert.ToString(callData.callId) ?? "";
                }
                if (!string.IsNullOrEmpty(callId))
                {
                    _logger.LogInformation("Instant call disconnected: {CallId}", callId);
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

        _socket.On("instant-error", response =>
        {
            try
            {
                var data = response.GetValue<object>();
                var json = JsonConvert.SerializeObject(data);
                var errorData = JsonConvert.DeserializeObject<dynamic>(json);
                
                string message = "Unknown error";
                if (errorData?.message != null)
                {
                    message = Convert.ToString(errorData.message) ?? "Unknown error";
                }
                _logger.LogError("Instant call error: {Message}", message);
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
                if (blockData?.message != null)
                {
                    message = Convert.ToString(blockData.message) ?? "Call blocked";
                }
                if (blockData?.reason != null)
                {
                    reason = Convert.ToString(blockData.reason) ?? "unknown";
                }
                _logger.LogWarning("Instant call blocked: {Reason} - {Message}", reason, message);
                Error?.Invoke(this, $"Call blocked: {message}");
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
                var json = JsonConvert.SerializeObject(data);
                var setupData = JsonConvert.DeserializeObject<dynamic>(json);
                
                if (setupData != null)
                {
                    string callId = Convert.ToString(setupData.callId) ?? string.Empty;
                    var participants = new List<string>();
                    
                    if (setupData.participants != null)
                    {
                        var participantsArray = setupData.participants as Newtonsoft.Json.Linq.JArray;
                        if (participantsArray != null)
                        {
                            participants = participantsArray.ToObject<List<string>>() ?? new List<string>();
                        }
                    }
                    
                    int participantCount = participants.Count;
                    _logger.LogInformation("WebRTC setup required for call: {CallId}, Participants: {Count}", callId, participantCount);
                    
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

        _socket.On("presence-update", response =>
        {
            try
            {
                // Try to get as object directly first
                object? presenceObj = null;
                try
                {
                    presenceObj = response.GetValue<object>();
                }
                catch
                {
                    // If that fails, try as string and deserialize
                    var presenceJson = response.GetValue<string>();
                    presenceObj = JsonConvert.DeserializeObject<dynamic>(presenceJson);
                }

                if (presenceObj != null)
                {
                    var presence = JsonConvert.DeserializeObject<dynamic>(JsonConvert.SerializeObject(presenceObj));
                    if (presence != null)
                    {
                        string userId = "";
                        string username = "";
                        bool isOnline = false;
                        
                        try
                        {
                            var userIdObj = presence.userId;
                            var usernameObj = presence.username;
                            var onlineObj = presence.online;
                            
                            userId = userIdObj != null ? Convert.ToString(userIdObj) ?? "" : "";
                            username = usernameObj != null ? Convert.ToString(usernameObj) ?? "" : "";
                            isOnline = onlineObj != null && (
                                Convert.ToString(onlineObj)?.Equals("True", StringComparison.OrdinalIgnoreCase) == true ||
                                Convert.ToString(onlineObj)?.Equals("true", StringComparison.OrdinalIgnoreCase) == true ||
                                onlineObj is bool b && b == true);
                        }
                        catch
                        {
                            // Use defaults already set
                        }
                        
                        _logger.LogInformation("Presence update: {UserId} ({Username}) - {Online}", userId, username, isOnline);
                        
                        // If this is about the current connection, update connection state
                        // (This would require knowing the current user ID - for now just update status)
                        
                        UserStatusChanged?.Invoke(this, new User 
                        { 
                            Id = userId ?? "",
                            Username = username ?? "",
                            Status = isOnline ? "online" : "offline",
                            IsOnline = isOnline
                        });
                        
                        // If the presence update is for online status, also update connection state
                        if (isOnline)
                        {
                            _logger.LogInformation("Presence update indicates online - updating connection state");
                        }
                    }
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
                        
                        try
                        {
                            var userIdObj = statusData.userId;
                            var usernameObj = statusData.username;
                            var statusValueObj = statusData.status;
                            
                            userId = userIdObj != null ? Convert.ToString(userIdObj) ?? "" : "";
                            username = usernameObj != null ? Convert.ToString(usernameObj) ?? "" : "";
                            status = statusValueObj != null ? Convert.ToString(statusValueObj) ?? "offline" : "offline";
                        }
                        catch
                        {
                            // Use defaults already set
                        }
                        
                        _logger.LogInformation("User status update: {UserId} ({Username}) - {Status}", userId, username, status);
                        
                        UserStatusChanged?.Invoke(this, new User 
                        { 
                            Id = userId ?? "",
                            Username = username ?? "",
                            Status = status ?? "offline",
                            IsOnline = (status ?? "offline") == "online"
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

    public void Dispose()
    {
        if (!_disposed)
        {
            DisconnectAsync().Wait(TimeSpan.FromSeconds(5));
            _socket?.Dispose();
            _disposed = true;
        }
    }
}

