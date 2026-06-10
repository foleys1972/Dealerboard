using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Services;
using TradePulse.Client.WPF.Services;
using TradePulse.Client.WPF.Logging;
using TradePulse.Client.WPF.ViewModels;
using TradePulse.Client.WPF.Views;

namespace TradePulse.Client.WPF;

public partial class App : Application
{
    private IHost? _host;

    private static void TryWriteStartupCrash(string message)
    {
        try
        {
            var appDataPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TradeCom",
                "Logs"
            );

            if (!Directory.Exists(appDataPath))
            {
                Directory.CreateDirectory(appDataPath);
            }

            var crashLogPath = Path.Combine(appDataPath, "startup_crash.log");
            File.AppendAllText(crashLogPath, $"[{DateTime.Now:O}] {message}{Environment.NewLine}");
        }
        catch
        {
        }
    }

    internal static void EnsureWindowVisible(Window window)
    {
        if (window.WindowState == WindowState.Minimized)
        {
            window.WindowState = WindowState.Normal;
        }

        if (!window.ShowInTaskbar)
        {
            window.ShowInTaskbar = true;
        }

        if (window.Visibility != Visibility.Visible)
        {
            window.Visibility = Visibility.Visible;
        }

        if (!window.IsVisible)
        {
            window.Show();
        }

        window.Activate();
        window.Topmost = true;
        window.Topmost = false;
        window.Focus();
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        try
        {
            DispatcherUnhandledException += (sender, args) =>
            {
                TryWriteStartupCrash($"DispatcherUnhandledException: {args.Exception}");
            };

            AppDomain.CurrentDomain.UnhandledException += (sender, args) =>
            {
                TryWriteStartupCrash($"UnhandledException: {args.ExceptionObject}");
            };

            System.Threading.Tasks.TaskScheduler.UnobservedTaskException += (sender, args) =>
            {
                TryWriteStartupCrash($"UnobservedTaskException: {args.Exception}");
            };

            // Setup log file path in AppData\Local\TradeCom\Logs
            var appDataPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TradeCom",
                "Logs"
            );

            if (!Directory.Exists(appDataPath))
            {
                Directory.CreateDirectory(appDataPath);
            }

            // Use one log file per day
            var logFileName = $"tradecom_{DateTime.Now:yyyyMMdd}.log";
            var logFilePath = Path.Combine(appDataPath, logFileName);

            // Also create a "latest.log" symlink/file for easy access
            var latestLogPath = Path.Combine(appDataPath, "latest.log");

            // Configure SSL certificate validation globally for self-signed certificates
            // This affects all HttpClient instances including those used by SocketIOClient
            ServicePointManager.ServerCertificateValidationCallback =
                (sender, certificate, chain, sslPolicyErrors) =>
                {
                    // Accept all certificates for development (self-signed certificates)
                    // In production, this should validate certificates properly
                    return true;
                };

            // Create host with dependency injection
            _host = Host.CreateDefaultBuilder()
                .ConfigureServices((context, services) =>
                {
                    // Configure logging with both console and file logging
                    services.AddLogging(builder =>
                    {
                        builder.AddConsole();
                        builder.AddProvider(new FileLoggerProvider(logFilePath));
                        builder.SetMinimumLevel(LogLevel.Debug); // Log everything for troubleshooting

                        // Set specific log levels for noisy components if needed
                        builder.AddFilter("Microsoft", LogLevel.Warning);
                        builder.AddFilter("System", LogLevel.Warning);
                    });

                    // Register configuration service first
                    services.AddSingleton<IConfigurationService, ConfigurationService>();

                    // Get configuration service to read initial server URL
                    var tempHost = Host.CreateDefaultBuilder()
                        .ConfigureServices((ctx, svc) => svc.AddSingleton<IConfigurationService, ConfigurationService>())
                        .Build();
                    var configService = tempHost.Services.GetRequiredService<IConfigurationService>();
                    var serverUrl = configService.ServerUrl;
                    tempHost.Dispose();

                    // Register services first (AuthService depends on ISocketService)
                    services.AddSingleton<ISocketService, SocketService>();
                    services.AddSingleton<IAudioService, AudioService>();
                    services.AddSingleton<IAudioStreamingService, AudioStreamingService>();
                    services.AddTransient<RtpOpusBridgeService>();
                    services.AddSingleton<IBroadcastRtpBridgeService, BroadcastRtpBridgeService>();
                    services.AddSingleton<IWebMediaEngineService, WebView2MediaEngineService>();
                    services.AddSingleton<ICallRecordingService, CallRecordingService>();

                    // Configure HttpClient for MediaSoupService
                    services.AddHttpClient<IMediaSoupService, MediaSoupService>(client =>
                    {
                        try
                        {
                            var cleanUrl = serverUrl.TrimEnd('/');
                            client.BaseAddress = new Uri(cleanUrl);
                        }
                        catch
                        {
                            client.BaseAddress = new Uri("https://192.168.1.41:5000");
                        }
                        client.Timeout = TimeSpan.FromSeconds(30);
                    })
                    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                    {
                        ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
                    });

                    // Configure HttpClient for DirectoryService
                    services.AddHttpClient<IDirectoryService, DirectoryService>(client =>
                    {
                        try
                        {
                            var cleanUrl = serverUrl.TrimEnd('/');
                            client.BaseAddress = new Uri(cleanUrl);
                        }
                        catch
                        {
                            client.BaseAddress = new Uri("https://192.168.1.41:5000");
                        }
                        client.Timeout = TimeSpan.FromSeconds(30);
                    })
                    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                    {
                        ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
                    });

                    // Configure HttpClient for DirectContactService
                    services.AddHttpClient<IDirectContactService, DirectContactService>(client =>
                    {
                        try
                        {
                            var cleanUrl = serverUrl.TrimEnd('/');
                            client.BaseAddress = new Uri(cleanUrl);
                        }
                        catch
                        {
                            client.BaseAddress = new Uri("https://192.168.1.41:5000");
                        }
                        client.Timeout = TimeSpan.FromSeconds(30);
                    })
                    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                    {
                        ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
                    });

                    // Configure HttpClient for UserIntercomService (shares same base URL as AuthService)
                    services.AddHttpClient<IUserIntercomService, UserIntercomService>(client =>
                    {
                        try
                        {
                            var cleanUrl = serverUrl.TrimEnd('/');
                            client.BaseAddress = new Uri(cleanUrl);
                        }
                        catch
                        {
                            client.BaseAddress = new Uri("https://192.168.1.41:5000");
                        }
                        client.Timeout = TimeSpan.FromSeconds(30);
                    })
                    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                    {
                        ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
                    });

                    services.AddSingleton<ICallService, CallService>();

                    services.AddSingleton<IAuthService, AuthService>();

                    // Configure HttpClient for UserService (shares same base URL as AuthService)
                    // UserService will get auth token from IAuthService for each request
                    services.AddHttpClient<IUserService, UserService>(client =>
                    {
                        try
                        {
                            // Ensure no trailing slash to avoid double slashes
                            var cleanUrl = serverUrl.TrimEnd('/');
                            client.BaseAddress = new Uri(cleanUrl);
                        }
                        catch
                        {
                            client.BaseAddress = new Uri("https://192.168.1.41:5000");
                        }
                        client.Timeout = TimeSpan.FromSeconds(30);
                    })
                    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                    {
                        ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
                    });

                    // Configure HttpClient for GroupService (shares same base URL as AuthService)
                    services.AddHttpClient<IGroupService, GroupService>(client =>
                    {
                        try
                        {
                            // Ensure no trailing slash to avoid double slashes
                            var cleanUrl = serverUrl.TrimEnd('/');
                            client.BaseAddress = new Uri(cleanUrl);
                        }
                        catch
                        {
                            client.BaseAddress = new Uri("https://192.168.1.41:5000");
                        }
                        client.Timeout = TimeSpan.FromSeconds(30);
                    })
                    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
                    {
                        ServerCertificateCustomValidationCallback = (message, cert, chain, errors) => true
                    });

                    // Register ViewModels
                    services.AddTransient<LoginViewModel>();
                    services.AddTransient<MainViewModel>();
                    services.AddTransient<SettingsViewModel>();

                    // Register Views
                    services.AddTransient<LoginWindow>();
                    services.AddTransient<MainWindow>();
                    services.AddTransient<SettingsWindow>();
                })
                .Build();

            // Start the host synchronously (blocking)
            _host.StartAsync().GetAwaiter().GetResult();

            // Log application startup
            var logger = _host.Services.GetRequiredService<ILogger<App>>();
            logger.LogInformation("=== TradeCom Client Starting ===");
            logger.LogInformation("Log file: {LogFilePath}", logFilePath);
            logger.LogInformation("Version: {Version}", System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "Unknown");
            logger.LogInformation("OS: {OSVersion}", Environment.OSVersion);
            logger.LogInformation(".NET Version: {DotNetVersion}", Environment.Version);

            // Copy to latest.log for easy access
            try
            {
                File.Copy(logFilePath, latestLogPath, overwrite: true);
            }
            catch
            {
                // Ignore if copy fails
            }

            try
            {
                var auth = _host.Services.GetService<IAuthService>();
                var recorder = _host.Services.GetService<ICallRecordingService>();
                if (auth != null && recorder != null)
                {
                    auth.UserAuthenticated += (_, __) =>
                    {
                        _ = Task.Run(async () =>
                        {
                            try
                            {
                                using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(5));
                                while (!cts.IsCancellationRequested)
                                {
                                    try
                                    {
                                        await recorder.ReconcilePendingUploadsAsync(cts.Token);
                                    }
                                    catch { }

                                    try
                                    {
                                        await Task.Delay(TimeSpan.FromSeconds(10), cts.Token);
                                    }
                                    catch { }
                                }
                            }
                            catch { }
                        });
                    };
                }
            }
            catch { }

            // Show login window
            var loginWindow = _host.Services.GetRequiredService<LoginWindow>();
            Current.MainWindow = loginWindow;
            loginWindow.Show();
            EnsureWindowVisible(loginWindow);
        }
        catch (Exception ex)
        {
            TryWriteStartupCrash(ex.ToString());
            MessageBox.Show($"The application failed to start.\n\n{ex.Message}", "Startup Error", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(-1);
        }
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        try
        {
            if (_host != null)
            {
                var logger = _host.Services.GetRequiredService<ILogger<App>>();
                logger.LogInformation("=== TradeCom Client Shutting Down ===");

                // Best-effort: stop WebView2 media engine quickly to release audio devices and WebView2 resources.
                try
                {
                    var mediaEngine = _host.Services.GetService<IWebMediaEngineService>();
                    if (mediaEngine != null)
                    {
                        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                        await mediaEngine.StopAllAsync(cts.Token);
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to stop WebView2 media engine during shutdown");
                }

                // Stop the host, but don't let shutdown hang forever.
                try
                {
                    var stopTask = _host.StopAsync();
                    var done = await Task.WhenAny(stopTask, Task.Delay(TimeSpan.FromSeconds(3)));
                    if (done != stopTask)
                    {
                        logger.LogWarning("Host StopAsync timed out; forcing process exit");
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Host StopAsync failed; forcing process exit");
                }

                try
                {
                    _host.Dispose();
                }
                catch { }
            }
        }
        finally
        {
            try
            {
                base.OnExit(e);
            }
            catch { }

            // Force terminate to avoid lingering background tasks (Socket.IO, WebView2) holding file locks.
            try
            {
                Environment.Exit(e.ApplicationExitCode);
            }
            catch { }
        }
    }

    // Helper methods for service location
    public static T GetService<T>() where T : class
    {
        if (Current is App app && app._host != null)
        {
            return app._host.Services.GetRequiredService<T>();
        }
        throw new InvalidOperationException("Host not initialized");
    }

    public static IServiceProvider GetServiceProvider()
    {
        if (Current is App app && app._host != null)
        {
            return app._host.Services;
        }
        throw new InvalidOperationException("Host not initialized");
    }
}
