using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Extensions.Logging;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using TradePulse.Client.Core.Services;

namespace TradePulse.Client.WPF.Services;

public sealed class WebView2MediaEngineService : IWebMediaEngineService, IDisposable
{
    private readonly ILogger<WebView2MediaEngineService> _logger;
    private readonly IConfigurationService _configService;
    private readonly IAuthService _authService;

    private readonly object _lock = new();
    private bool _disposed;
    private bool _initialized;

    private CoreWebView2Environment? _cachedEnvironment;
    private string? _cachedEnvironmentKey;

    private Window? _hostWindow;
    private WebView2? _webView;
    private TaskCompletionSource<bool>? _readyTcs;

    private bool _useExternalWebView;

    private bool _navigationCompleted;
    private bool _pageReady;
    private bool _initPosted;

    private bool _insecureCertRetryAttempted;

    private void DisposeInternalWebView_NoThrow()
    {
        try
        {
            WebView2? webView;
            Window? host;
            bool useExternal;

            lock (_lock)
            {
                webView = _webView;
                host = _hostWindow;
                useExternal = _useExternalWebView;
            }

            // If the app provided the WebView2 (MainWindow VideoWebView), we must NOT dispose it here.
            if (useExternal)
            {
                return;
            }

            if (Application.Current?.Dispatcher == null)
            {
                return;
            }

            // WebView2 objects must be touched on the UI thread.
            Application.Current.Dispatcher.Invoke(() =>
            {
                try
                {
                    if (webView != null)
                    {
                        try { webView.Source = null; } catch { }
                        try { webView.Dispose(); } catch { }
                    }
                }
                catch { }

                try
                {
                    if (host != null)
                    {
                        try { host.Content = null; } catch { }
                        try { host.Close(); } catch { }
                    }
                }
                catch { }
            });
        }
        catch { }
    }

    private void ResetEngineState_NoThrow()
    {
        DisposeInternalWebView_NoThrow();

        try
        {
            _readyTcs?.TrySetCanceled();
        }
        catch { }

        _webView = null;
        _hostWindow = null;
        _readyTcs = null;

        _useExternalWebView = false;

        _navigationCompleted = false;
        _pageReady = false;
        _initPosted = false;

        _initialized = false;
    }

    public void AttachWebView2Host(WebView2 webView)
    {
        if (webView == null) throw new ArgumentNullException(nameof(webView));

        lock (_lock)
        {
            _webView = webView;
            _useExternalWebView = true;
        }
    }

    public WebView2MediaEngineService(
        ILogger<WebView2MediaEngineService> logger,
        IConfigurationService configService,
        IAuthService authService)
    {
        _logger = logger;
        _configService = configService;
        _authService = authService;
    }

    public async Task EnsureInitializedAsync(CancellationToken cancellationToken = default)
    {
        TaskCompletionSource<bool> tcs;
        var shouldInitialize = false;

        lock (_lock)
        {
            // If the engine was initialized previously but the underlying WebView2 got disposed
            // (e.g. owned window was closed during LoginWindow -> MainWindow swap), reset.
            if (_initialized && (_webView == null || (!_useExternalWebView && _hostWindow == null)))
            {
                ResetEngineState_NoThrow();
            }

            if (_readyTcs != null)
            {
                tcs = _readyTcs;
            }
            else
            {
                _initialized = true;
                _readyTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                tcs = _readyTcs;
                shouldInitialize = true;

                _navigationCompleted = false;
                _pageReady = false;
                _initPosted = false;
            }
        }

        if (!shouldInitialize)
        {
            using (cancellationToken.Register(() => tcs.TrySetCanceled(cancellationToken)))
            {
                await tcs.Task;
                return;
            }
        }

        try
        {
            // WebView2 must be created on the UI thread.
            await Application.Current.Dispatcher.InvokeAsync(async () =>
            {
                var serverUrl = _configService.ServerUrl.TrimEnd('/');
                var target = new Uri($"{serverUrl}/wpf-media-engine?wv2ts={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}");
                _logger.LogInformation("WebView2 EnsureInitializedAsync: ServerUrl={ServerUrl}, AllowInsecureCertificates={AllowInsecureCertificates}", 
                    serverUrl, _configService.AllowInsecureCertificates);

                WebView2? localWebView;
                bool useExternal;

                lock (_lock)
                {
                    localWebView = _webView;
                    useExternal = _useExternalWebView;
                }

                if (useExternal && localWebView != null)
                {
                    _webView = localWebView;

                    try
                    {
                        _webView.Unloaded += (_, __) =>
                        {
                            lock (_lock)
                            {
                                ResetEngineState_NoThrow();
                            }
                        };
                    }
                    catch { }
                }
                else
                {
                    _hostWindow = new Window
                    {
                        Width = 1,
                        Height = 1,
                        WindowStyle = WindowStyle.None,
                        ShowInTaskbar = false,
                        ShowActivated = false,
                        Visibility = Visibility.Visible,
                        Opacity = 0,
                        WindowState = WindowState.Normal,
                    };

                    try
                    {
                        _hostWindow.Left = -32000;
                        _hostWindow.Top = -32000;
                    }
                    catch { }

                    try
                    {
                        // IMPORTANT: do NOT set Owner.
                        // App swaps Application.Current.MainWindow from LoginWindow -> MainWindow.
                        // Owned windows close when owner closes, which can dispose WebView2 right before a call.
                        _hostWindow.Owner = null;
                    }
                    catch { }

                    try
                    {
                        _hostWindow.Closed += (_, __) =>
                        {
                            lock (_lock)
                            {
                                ResetEngineState_NoThrow();
                            }
                        };
                    }
                    catch { }

                    _webView = new WebView2
                    {
                        Width = 1,
                        Height = 1,
                        HorizontalAlignment = HorizontalAlignment.Left,
                        VerticalAlignment = VerticalAlignment.Top
                    };

                    try
                    {
                        _webView.Unloaded += (_, __) =>
                        {
                            lock (_lock)
                            {
                                ResetEngineState_NoThrow();
                            }
                        };
                    }
                    catch { }

                    _hostWindow.Content = _webView;

                    try
                    {
                        _hostWindow.Show();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to show WebView2 host window");
                    }
                }

                _webView.CoreWebView2InitializationCompleted += (_, e) =>
                {
                    if (!e.IsSuccess)
                    {
                        _logger.LogError(e.InitializationException, "WebView2 initialization failed");
                        tcs.TrySetException(e.InitializationException ?? new InvalidOperationException("WebView2 initialization failed"));
                    }
                };

                _webView.WebMessageReceived += (_, e) =>
                {
                    try
                    {
                        var json = e.WebMessageAsJson;
                        using var doc = JsonDocument.Parse(json);
                        var root = doc.RootElement;
                        if (root.ValueKind != JsonValueKind.Object)
                        {
                            return;
                        }

                        if (root.TryGetProperty("type", out var msgTypeProp)
                            && msgTypeProp.ValueKind == JsonValueKind.String
                            && string.Equals(msgTypeProp.GetString(), "ready", StringComparison.OrdinalIgnoreCase))
                        {
                            lock (_lock)
                            {
                                _pageReady = true;
                            }

                            _logger.LogInformation("WebView2 media engine signaled ready");

                            // If navigation is already complete, we can now safely post init (token).
                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    await TryPostInitAsync();
                                }
                                catch (Exception ex)
                                {
                                    _logger.LogWarning(ex, "Failed to post init after ready");
                                }
                            });

                            return;
                        }

                        if (root.TryGetProperty("type", out var typeProp)
                            && typeProp.ValueKind == JsonValueKind.String
                            && string.Equals(typeProp.GetString(), "log", StringComparison.OrdinalIgnoreCase))
                        {
                            var level = root.TryGetProperty("level", out var levelProp) && levelProp.ValueKind == JsonValueKind.String
                                ? (levelProp.GetString() ?? "info")
                                : "info";
                            var message = root.TryGetProperty("message", out var msgProp) && msgProp.ValueKind == JsonValueKind.String
                                ? (msgProp.GetString() ?? string.Empty)
                                : string.Empty;

                            string? data = null;
                            try
                            {
                                if (root.TryGetProperty("data", out var dataProp))
                                {
                                    data = dataProp.GetRawText();
                                }
                            }
                            catch { }

                            if (string.Equals(level, "error", StringComparison.OrdinalIgnoreCase))
                            {
                                _logger.LogError("WebView2 engine: {Message} data={Data}", message, data);
                            }
                            else if (string.Equals(level, "warn", StringComparison.OrdinalIgnoreCase) || string.Equals(level, "warning", StringComparison.OrdinalIgnoreCase))
                            {
                                _logger.LogWarning("WebView2 engine: {Message} data={Data}", message, data);
                            }
                            else if (string.Equals(level, "debug", StringComparison.OrdinalIgnoreCase))
                            {
                                _logger.LogDebug("WebView2 engine: {Message} data={Data}", message, data);
                            }
                            else
                            {
                                _logger.LogInformation("WebView2 engine: {Message} data={Data}", message, data);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug(ex, "Failed to parse WebView2 WebMessageReceived");
                    }
                };

                _webView.NavigationCompleted += async (_, e) =>
                {
                    _logger.LogInformation("WebView2 navigation completed. success={IsSuccess}", e.IsSuccess);

                    if (!e.IsSuccess)
                    {
                        _logger.LogError("WebView2 navigation failed. status={Status}", e.WebErrorStatus);
                        tcs.TrySetException(new InvalidOperationException($"WebView2 navigation failed: {e.WebErrorStatus}"));
                        return;
                    }

                    lock (_lock)
                    {
                        _navigationCompleted = true;
                    }

                    try
                    {
                        // Only post init after the page has attached its listener and signaled ready.
                        await TryPostInitAsync();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "WebView2 media engine init failed");
                        tcs.TrySetException(ex);
                    }
                };

                try
                {
                    // Create a per-user data folder under LocalAppData so WebView2 can persist storage.
                    var userDataFolder = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "TradeCom",
                        "WebView2");

                    Directory.CreateDirectory(userDataFolder);

                    var options = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required" +
        (_configService.AllowInsecureCertificates ? " --ignore-certificate-errors" : string.Empty));
                    _logger.LogInformation("WebView2 init: AllowInsecureCertificates={AllowInsecureCertificates}, Options={Options}", 
                        _configService.AllowInsecureCertificates, options.AdditionalBrowserArguments);

                    if (_webView.CoreWebView2 == null)
                    {
                        var envKey = $"{userDataFolder}|{_configService.AllowInsecureCertificates}";
                        CoreWebView2Environment? env = null;

                        lock (_lock)
                        {
                            if (_cachedEnvironment != null && string.Equals(_cachedEnvironmentKey, envKey, StringComparison.Ordinal))
                            {
                                env = _cachedEnvironment;
                            }
                        }

                        if (env == null)
                        {
                            env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
                            lock (_lock)
                            {
                                _cachedEnvironment = env;
                                _cachedEnvironmentKey = envKey;
                            }
                        }

                        await _webView.EnsureCoreWebView2Async(env);
                    }

                    try
                    {
                        if (_webView.CoreWebView2 != null)
                        {
                            _webView.CoreWebView2.IsMuted = false;
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to unmute WebView2 CoreWebView2");
                    }

                    try
                    {
                        if (_webView.CoreWebView2 != null)
                        {
                            _webView.CoreWebView2.PermissionRequested += (_, args) =>
                            {
                                try
                                {
                                    var deferral = args.GetDeferral();
                                    _logger.LogInformation(
                                        "WebView2 permission requested: kind={Kind} uri={Uri} userInitiated={UserInitiated}",
                                        args.PermissionKind,
                                        args.Uri,
                                        args.IsUserInitiated);

                                    if (args.PermissionKind == CoreWebView2PermissionKind.Microphone
                                        || args.PermissionKind == CoreWebView2PermissionKind.Camera)
                                    {
                                        try { args.SavesInProfile = true; } catch { }
                                        args.State = CoreWebView2PermissionState.Allow;
                                        _logger.LogInformation("WebView2 permission auto-allowed: {Kind} ({Uri})", args.PermissionKind, args.Uri);
                                    }

                                    try { deferral.Complete(); } catch { }
                                }
                                catch { }
                            };
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to configure WebView2 PermissionRequested handler");
                    }

                    try
                    {
                        if (_webView.CoreWebView2 != null)
                        {
                            var initPayload = JsonSerializer.Serialize(new
                            {
                                serverUrl = _configService.ServerUrl.TrimEnd('/'),
                                token = _authService.AuthToken ?? string.Empty,
                            });

                            // Inject init configuration before the SPA runs so it can start immediately
                            // without racing WebView2 postMessage listener attachment.
                            await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                                $"window.__tpMediaEngineInit = {initPayload};\n" +
                                "try { window.chrome && window.chrome.webview && window.chrome.webview.postMessage({ type: 'ready' }); } catch (e) {}\n");
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to inject media engine init script");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to EnsureCoreWebView2Async");
                    tcs.TrySetException(ex);
                    return;
                }

                _logger.LogInformation("WebView2 media engine navigating: {Url}", target);
                // Set Source after CoreWebView2 is initialized to ensure bypass flags take effect
                _webView.Source = target;
            });

            using (cancellationToken.Register(() => tcs.TrySetCanceled(cancellationToken)))
            {
                try
                {
                    await tcs.Task;
                }
                catch (OperationCanceledException ex)
                {
                    _logger.LogInformation(ex, "WebView2 media engine initialization canceled");
                    throw;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "WebView2 media engine initialization failed while waiting for ready");
                    throw;
                }
            }
        }
        catch (Exception ex)
        {
            var isCertInvalid = ex is InvalidOperationException ioe
                && ioe.Message != null
                && ioe.Message.Contains("CertificateIsInvalid", StringComparison.OrdinalIgnoreCase);

            if (isCertInvalid && !_configService.AllowInsecureCertificates && !_insecureCertRetryAttempted)
            {
                _insecureCertRetryAttempted = true;
                _logger.LogWarning("WebView2 failed due to invalid certificate. Enabling AllowInsecureCertificates and retrying initialization once.");

                try
                {
                    _configService.AllowInsecureCertificates = true;
                    _configService.Save();
                }
                catch (Exception saveEx)
                {
                    _logger.LogWarning(saveEx, "Failed to persist AllowInsecureCertificates setting");
                }

                lock (_lock)
                {
                    ResetEngineState_NoThrow();
                }

                await EnsureInitializedAsync(cancellationToken);
                return;
            }

            lock (_lock)
            {
                _initialized = false;
            }
            throw;
        }
    }

    public async Task StartCallAsync(string callId, bool enableVideo, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(callId)) return;
        await EnsureInitializedAsync(cancellationToken);

        _logger.LogInformation("WebView2 media engine StartCallAsync: {CallId} enableVideo={EnableVideo}", callId, enableVideo);

        // For video calls we need the WebView2 visible so Chromium can render video.
        // This first implementation uses a dedicated window; later we can embed into MainWindow.
        try
        {
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                if (_hostWindow == null) return;

                try
                {
                    _logger.LogInformation("WebView2 host window before toggle: enableVideo={EnableVideo} AllowsTransparency={AllowsTransparency} WindowStyle={WindowStyle} Opacity={Opacity}",
                        enableVideo,
                        _hostWindow.AllowsTransparency,
                        _hostWindow.WindowStyle,
                        _hostWindow.Opacity);
                }
                catch { }

                if (enableVideo)
                {
                    try
                    {
                        if (_hostWindow.AllowsTransparency)
                        {
                            _hostWindow.WindowStyle = WindowStyle.None;
                            _hostWindow.AllowsTransparency = false;
                        }
                    }
                    catch { }

                    _hostWindow.Width = 900;
                    _hostWindow.Height = 600;
                    _hostWindow.WindowStyle = WindowStyle.SingleBorderWindow;
                    _hostWindow.ShowInTaskbar = true;
                    _hostWindow.Opacity = 1;
                    _hostWindow.Visibility = Visibility.Visible;
                    _hostWindow.Title = string.Empty;
                    try { _hostWindow.WindowStartupLocation = WindowStartupLocation.CenterScreen; } catch { }
                    try { _hostWindow.Activate(); } catch { }
                }
                else
                {
                    try
                    {
                        if (_hostWindow.AllowsTransparency)
                        {
                            _hostWindow.WindowStyle = WindowStyle.None;
                            _hostWindow.AllowsTransparency = false;
                        }
                    }
                    catch { }

                    try { _hostWindow.WindowStyle = WindowStyle.None; } catch { }
                    _hostWindow.Width = 1;
                    _hostWindow.Height = 1;
                    _hostWindow.ShowInTaskbar = false;
                    _hostWindow.Opacity = 0;
                    _hostWindow.Visibility = Visibility.Visible;
                    try
                    {
                        _hostWindow.Left = -32000;
                        _hostWindow.Top = -32000;
                    }
                    catch { }
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to toggle WebView2 media engine window visibility");
        }

        await PostMessageAsync(new
        {
            type = "startCall",
            callId,
            enableVideo
        }, cancellationToken);
    }

    public async Task SetMutedAsync(bool muted, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("WebView2 media engine SetMutedAsync: muted={Muted}", muted);
        await EnsureInitializedAsync(cancellationToken);

        await PostMessageAsync(new
        {
            type = "setMuted",
            muted
        }, cancellationToken);
    }

    public async Task StopCallAsync(string callId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(callId)) return;
        _logger.LogInformation("WebView2 media engine StopCallAsync: {CallId}", callId);
        await EnsureInitializedAsync(cancellationToken);

        await PostMessageAsync(new
        {
            type = "stopCall",
            callId
        }, cancellationToken);

        // Hide after stopping.
        try
        {
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                if (_hostWindow == null) return;
                _hostWindow.Width = 1;
                _hostWindow.Height = 1;
                _hostWindow.WindowStyle = WindowStyle.None;
                _hostWindow.ShowInTaskbar = false;
                _hostWindow.Opacity = 0;
                _hostWindow.Visibility = Visibility.Visible;
                try
                {
                    _hostWindow.Left = -32000;
                    _hostWindow.Top = -32000;
                }
                catch { }
            });
        }
        catch { }
    }

    public async Task StopAllAsync(CancellationToken cancellationToken = default)
    {
        await EnsureInitializedAsync(cancellationToken);

        await PostMessageAsync(new
        {
            type = "stopAll"
        }, cancellationToken);
    }

    private async Task SendInitAsync()
    {
        var token = _authService.AuthToken;
        if (string.IsNullOrWhiteSpace(token))
        {
            _logger.LogWarning("WebView2 media engine init: AuthToken not available yet");
        }

        await PostMessageAsync(new
        {
            type = "init",
            serverUrl = _configService.ServerUrl.TrimEnd('/'),
            token = token ?? string.Empty,
        }, CancellationToken.None);
    }

    private async Task PostInitDirectAsync()
    {
        WebView2? webView;
        lock (_lock)
        {
            webView = _webView;
        }

        if (webView?.CoreWebView2 == null)
        {
            throw new InvalidOperationException("WebView2 media engine is not ready");
        }

        var token = _authService.AuthToken;
        if (string.IsNullOrWhiteSpace(token))
        {
            _logger.LogWarning("WebView2 media engine init: AuthToken not available yet");
        }

        await Application.Current.Dispatcher.InvokeAsync(() =>
        {
            var json = JsonSerializer.Serialize(new
            {
                type = "init",
                serverUrl = _configService.ServerUrl.TrimEnd('/'),
                token = token ?? string.Empty,
            });
            webView.CoreWebView2.PostWebMessageAsJson(json);
        }).Task;
    }

    private async Task TryPostInitAsync()
    {
        WebView2? webView;
        TaskCompletionSource<bool>? readyTcs;
        bool shouldPost;

        lock (_lock)
        {
            webView = _webView;
            readyTcs = _readyTcs;

            shouldPost = !_initPosted && _navigationCompleted && _pageReady;
            if (shouldPost)
            {
                _initPosted = true;
            }
        }

        if (!shouldPost)
        {
            return;
        }

        if (webView?.CoreWebView2 == null)
        {
            throw new InvalidOperationException("WebView2 media engine is not ready");
        }

        // IMPORTANT: post init without waiting on _readyTcs.
        // PostMessageAsync waits on _readyTcs, so using it here would deadlock initialization.
        await PostInitDirectAsync();
        _logger.LogInformation("WebView2 media engine init posted (handshake)");
        readyTcs?.TrySetResult(true);
    }

    private async Task PostMessageAsync(object payload, CancellationToken cancellationToken)
    {
        WebView2? webView;
        TaskCompletionSource<bool>? readyTcs;
        lock (_lock)
        {
            webView = _webView;
            readyTcs = _readyTcs;
        }

        if (webView == null)
        {
            throw new InvalidOperationException("WebView2 media engine is not initialized");
        }

        if (readyTcs != null)
        {
            using (cancellationToken.Register(() => readyTcs.TrySetCanceled(cancellationToken)))
            {
                await readyTcs.Task;
            }
        }

        try
        {
            await Application.Current.Dispatcher.InvokeAsync(() =>
            {
                var json = JsonSerializer.Serialize(payload);

                var core = webView.CoreWebView2;
                if (core == null)
                {
                    throw new InvalidOperationException("WebView2 media engine is not ready");
                }

                core.PostWebMessageAsJson(json);
            }).Task;
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("disposed", StringComparison.OrdinalIgnoreCase))
        {
            // Allow caller to retry by reinitializing.
            lock (_lock)
            {
                ResetEngineState_NoThrow();
            }
            throw;
        }
        catch (COMException)
        {
            lock (_lock)
            {
                ResetEngineState_NoThrow();
            }
            throw;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        try
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                try
                {
                    _webView?.Dispose();
                }
                catch { }

                try
                {
                    _hostWindow?.Close();
                }
                catch { }

                _webView = null;
                _hostWindow = null;
            });
        }
        catch { }
    }
}
