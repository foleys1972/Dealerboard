using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Services;
using TradePulse.Client.WPF.Logging;
using TradePulse.Client.WPF.ViewModels;
using TradePulse.Client.WPF.Views;

namespace TradePulse.Client.WPF;

public partial class App : Application
{
    private IHost? _host;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Setup log file path in AppData\Local\TradePulse\Logs
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "TradePulse",
            "Logs"
        );

        if (!Directory.Exists(appDataPath))
        {
            Directory.CreateDirectory(appDataPath);
        }

        // Use one log file per day
        var logFileName = $"tradepulse_{DateTime.Now:yyyyMMdd}.log";
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
                
                services.AddSingleton<ICallService, CallService>();

                // Configure HttpClient for AuthService
                // AddHttpClient creates a factory but doesn't register the service itself
                services.AddHttpClient(nameof(IAuthService), client =>
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
                    ServerCertificateCustomValidationCallback = (message, cert, chain, errors) =>
                    {
                        // Accept all certificates for development (self-signed certificates)
                        // In production, this should validate certificates properly
                        return true;
                    }
                });
                
                // Register AuthService as singleton so UserService gets the same instance with auth token
                services.AddSingleton<IAuthService>(sp =>
                {
                    var httpClientFactory = sp.GetRequiredService<IHttpClientFactory>();
                    var httpClient = httpClientFactory.CreateClient(nameof(IAuthService));
                    var socketService = sp.GetRequiredService<ISocketService>();
                    var configService = sp.GetRequiredService<IConfigurationService>();
                    var logger = sp.GetRequiredService<ILogger<AuthService>>();
                    return new AuthService(logger, httpClient, socketService, configService);
                });

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
        logger.LogInformation("=== TradePulse Client Starting ===");
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

        // Show login window
        var loginWindow = _host.Services.GetRequiredService<LoginWindow>();
        loginWindow.Show();
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        if (_host != null)
        {
            var logger = _host.Services.GetRequiredService<ILogger<App>>();
            logger.LogInformation("=== TradePulse Client Shutting Down ===");
            
            await _host.StopAsync();
            _host.Dispose();
        }

        base.OnExit(e);
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
