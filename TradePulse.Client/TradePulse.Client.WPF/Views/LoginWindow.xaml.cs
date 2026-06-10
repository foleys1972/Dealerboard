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
using TradePulse.Client.WPF.ViewModels;

namespace TradePulse.Client.WPF.Views;

public partial class LoginWindow : Window
{
    private readonly IAuthService _authService;
    private readonly ILogger<LoginWindow>? _logger;
    private bool _mainWindowShown = false;

    public LoginWindow(LoginViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;

        // Get services for fallback authentication check
        var serviceProvider = App.GetServiceProvider();
        _authService = serviceProvider.GetRequiredService<IAuthService>();
        _logger = serviceProvider.GetService<ILogger<LoginWindow>>();
        var callRecordingService = serviceProvider.GetService<ICallRecordingService>();

        viewModel.LoginSuccessful += (sender, e) =>
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
        };

        // Also subscribe to UserAuthenticated as a fallback
        _authService.UserAuthenticated += (sender, user) =>
        {
            _logger?.LogInformation("UserAuthenticated event received in LoginWindow - showing MainWindow as fallback");
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
            _logger?.LogInformation("ShowMainWindow called - attempting to show MainWindow");
            
            // Close login window and show main window
            var mainWindow = App.GetService<MainWindow>();
            _logger?.LogInformation("MainWindow service retrieved: {IsNull}", mainWindow == null);
            
            if (mainWindow != null)
            {
                _mainWindowShown = true;
                _logger?.LogInformation("Showing MainWindow");
                Application.Current.MainWindow = mainWindow;
                mainWindow.Show();
                App.EnsureWindowVisible(mainWindow);
                _logger?.LogInformation("Closing LoginWindow");
                this.Close();
            }
            else
            {
                _logger?.LogError("MainWindow service returned null");
                System.Windows.MessageBox.Show("Failed to create main window. Please check the logs.", "Error", System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Error);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Exception in ShowMainWindow: {Message}", ex.Message);
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

