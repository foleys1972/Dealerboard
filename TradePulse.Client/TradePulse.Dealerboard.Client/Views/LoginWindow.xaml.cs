using System;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Services;
using TradePulse.Dealerboard.Client.ViewModels;

namespace TradePulse.Dealerboard.Client.Views;

public partial class LoginWindow : Window
{
    private readonly IAuthService _authService;
    private readonly ILogger<LoginWindow>? _logger;
    private bool _mainWindowShown = false;

    public LoginWindow(LoginViewModel viewModel)
    {
        try
        {
            // Get logger first (before InitializeComponent so we can log errors)
            var serviceProvider = App.GetServiceProvider();
            _logger = serviceProvider.GetService<ILogger<LoginWindow>>();
            _logger?.LogInformation("=== LoginWindow: Constructor called ===");

            var callRecordingService = serviceProvider.GetService<ICallRecordingService>();
            
            InitializeComponent();
            _logger?.LogInformation("LoginWindow: InitializeComponent completed");
            
            DataContext = viewModel;
            _logger?.LogInformation("LoginWindow: DataContext set to LoginViewModel");

            // Get services for fallback authentication check
            _authService = serviceProvider.GetRequiredService<IAuthService>();
            _logger?.LogInformation("LoginWindow: Retrieved IAuthService");

            viewModel.LoginSuccessful += (sender, e) =>
            {
                _logger?.LogInformation("LoginWindow: LoginSuccessful event received from ViewModel");
                try
                {
                    _ = Task.Run(async () =>
                    {
                        try { if (callRecordingService != null) await callRecordingService.RefreshClientConfigAsync(); } catch { }
                    });
                }
                catch { }
                ShowMainWindow();
            };
            _logger?.LogInformation("LoginWindow: Registered LoginSuccessful event handler");

            // Also subscribe to UserAuthenticated as a fallback
            _authService.UserAuthenticated += (sender, user) =>
            {
                _logger?.LogInformation("LoginWindow: UserAuthenticated event received - showing MainWindow as fallback for user {Username}", user?.Username);
                // Small delay to ensure LoginSuccessful has a chance to fire first
                Task.Delay(100).ContinueWith(_ =>
                {
                    Dispatcher.Invoke(() =>
                    {
                        try
                        {
                            _ = Task.Run(async () =>
                            {
                                try { if (callRecordingService != null) await callRecordingService.RefreshClientConfigAsync(); } catch { }
                            });
                        }
                        catch { }
                        ShowMainWindow();
                    });
                });
            };
            _logger?.LogInformation("LoginWindow: Registered UserAuthenticated event handler");
            _logger?.LogInformation("=== LoginWindow: Constructor completed successfully ===");
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "LoginWindow: Exception in constructor: {Message}\nStack Trace: {StackTrace}", ex.Message, ex.StackTrace);
            MessageBox.Show($"Failed to initialize login window: {ex.Message}\n\nPlease check the logs for more details.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            throw;
        }
    }

    private void ShowMainWindow()
    {
        if (_mainWindowShown)
        {
            _logger?.LogInformation("ShowMainWindow called but MainWindow already shown - ignoring");
            return;
        }
        
        try
        {
            _logger?.LogInformation("=== ShowMainWindow: Starting ===");
            _logger?.LogInformation("ShowMainWindow: Attempting to retrieve MainWindow from service provider");
            
            // Close login window and show main window
            var mainWindow = App.GetService<MainWindow>();
            _logger?.LogInformation("ShowMainWindow: MainWindow service retrieved: {IsNull}", mainWindow == null);
            
            if (mainWindow != null)
            {
                _mainWindowShown = true;
                _logger?.LogInformation("ShowMainWindow: Setting Application.Current.MainWindow");
                Application.Current.MainWindow = mainWindow;
                
                _logger?.LogInformation("ShowMainWindow: Calling mainWindow.Show()");
                mainWindow.Show();
                
                _logger?.LogInformation("ShowMainWindow: Calling App.EnsureWindowVisible");
                App.EnsureWindowVisible(mainWindow);
                
                _logger?.LogInformation("ShowMainWindow: Closing LoginWindow");
                this.Close();
                _logger?.LogInformation("=== ShowMainWindow: Completed Successfully ===");
            }
            else
            {
                _logger?.LogError("ShowMainWindow: MainWindow service returned null - cannot proceed");
                System.Windows.MessageBox.Show("Failed to create main window. Please check the logs.", "Error", System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "ShowMainWindow: Exception occurred: {Message}\nStack Trace: {StackTrace}", ex.Message, ex.StackTrace);
            System.Windows.MessageBox.Show($"Failed to open main window: {ex.Message}\n\nPlease check the logs for more details.", "Error", System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Error);
        }
    }

    private void PasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        if (DataContext is LoginViewModel viewModel)
        {
            viewModel.Password = ((PasswordBox)sender).Password;
        }
    }

    private void AutoDetectButton_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is LoginViewModel viewModel)
        {
            try
            {
                // Try to find the local IP address
                string? localIp = null;
                foreach (var networkInterface in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (networkInterface.OperationalStatus == OperationalStatus.Up &&
                        networkInterface.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    {
                        foreach (var ip in networkInterface.GetIPProperties().UnicastAddresses)
                        {
                            if (ip.Address.AddressFamily == AddressFamily.InterNetwork &&
                                !IPAddress.IsLoopback(ip.Address))
                            {
                                localIp = ip.Address.ToString();
                                break;
                            }
                        }
                        if (localIp != null) break;
                    }
                }

                if (!string.IsNullOrEmpty(localIp))
                {
                    viewModel.ServerUrl = $"https://{localIp}:5000";
                }
                else
                {
                    viewModel.ServerUrl = "https://localhost:5000";
                }
            }
            catch
            {
                viewModel.ServerUrl = "https://localhost:5000";
            }
        }
    }
}

