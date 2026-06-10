using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TradePulse.Dealerboard.Client.ViewModels;
using TradePulse.Client.Core.Services;

namespace TradePulse.Dealerboard.Client;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    private readonly ILogger<MainWindow>? _logger;
    private readonly IAuthService _authService;
    private readonly IConfigurationService _configService;
    private readonly IWebMediaEngineService? _webMediaEngineService;

    private CancellationTokenSource? _contactLongPressCts;
    private bool _contactLongPressTriggered;
    private const int ContactLongPressMs = 650;

    private CancellationTokenSource? _directContactLongPressCts;
    private bool _directContactLongPressTriggered;

    private MainViewModel? ViewModel => DataContext as MainViewModel;

    public MainWindow(MainViewModel viewModel)
    {
        try
        {
            // Get logger from service provider
            var serviceProvider = App.GetServiceProvider();
            _logger = serviceProvider.GetService<ILogger<MainWindow>>();
            _authService = serviceProvider.GetRequiredService<IAuthService>();
            _configService = serviceProvider.GetRequiredService<IConfigurationService>();
            _webMediaEngineService = serviceProvider.GetService<IWebMediaEngineService>();

            _logger?.LogInformation("MainWindow: Constructor called");

            InitializeComponent();
            _logger?.LogInformation("MainWindow: InitializeComponent completed");

            DataContext = viewModel;
            _logger?.LogInformation("MainWindow: DataContext set to MainViewModel");

            try
            {
                if (_webMediaEngineService is Services.WebView2MediaEngineService wv2 && VideoWebView != null)
                {
                    wv2.AttachWebView2Host(VideoWebView);
                }
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "MainWindow: Failed to attach VideoWebView to WebView2MediaEngineService");
            }

            Loaded += (_, __) => _ = TryInitializeWebViewsAsync();

            _authService.UserAuthenticated += (_, __) =>
            {
                // After native login succeeds, initialize webviews (media engine + intercom UI).
                Dispatcher.Invoke(() => { _ = TryInitializeWebViewsAsync(); });
            };

            viewModel.LogoutRequested += (sender, e) =>
            {
                _logger?.LogInformation("MainWindow: LogoutRequested event received");
                try
                {
                    // Show login window and close main window
                    var loginWindow = App.GetService<Views.LoginWindow>();
                    _logger?.LogInformation("MainWindow: Retrieved LoginWindow from service provider");
                    Application.Current.MainWindow = loginWindow;
                    loginWindow.Show();
                    App.EnsureWindowVisible(loginWindow);
                    _logger?.LogInformation("MainWindow: LoginWindow shown, closing MainWindow");
                    this.Close();
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "MainWindow: Error during logout");
                    MessageBox.Show($"Error during logout: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };

            _logger?.LogInformation("MainWindow: LogoutRequested event handler registered");
            _logger?.LogInformation("MainWindow: Constructor completed successfully");
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "MainWindow: Exception in constructor: {Message}", ex.Message);
            MessageBox.Show($"Failed to initialize main window: {ex.Message}\n\nPlease check the logs for more details.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            throw;
        }
    }

    private async Task TryInitializeWebViewsAsync()
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_authService.AuthToken))
            {
                _logger?.LogInformation("MainWindow: WebView init skipped - no auth token yet");
                return;
            }

            if (string.IsNullOrWhiteSpace(_configService.ServerUrl))
            {
                _logger?.LogInformation("MainWindow: WebView init skipped - no server url");
                return;
            }

            if (_webMediaEngineService != null)
            {
                await _webMediaEngineService.EnsureInitializedAsync();
            }

            if (ViewModel != null)
            {
                await ViewModel.EnsureDataLoadedAsync();
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "MainWindow: WebView initialization failed");
        }
    }

    private void PttButton_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        try
        {
            if (ViewModel?.PttDownCommand != null && ViewModel.PttDownCommand.CanExecute(null))
            {
                ViewModel.PttDownCommand.Execute(null);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "PTT down failed");
        }
    }

    private void PttButton_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        try
        {
            if (ViewModel?.PttUpCommand != null && ViewModel.PttUpCommand.CanExecute(null))
            {
                ViewModel.PttUpCommand.Execute(null);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "PTT up failed");
        }
    }

    private void CancelContactLongPress()
    {
        try
        {
            _contactLongPressCts?.Cancel();
            _contactLongPressCts?.Dispose();
        }
        catch { }
        finally
        {
            _contactLongPressCts = null;
            _contactLongPressTriggered = false;
        }
    }

    private bool IsEventFromButtonOrInteractive(DependencyObject? source)
    {
        try
        {
            var current = source;
            while (current != null)
            {
                if (current is ButtonBase) return true;
                current = System.Windows.Media.VisualTreeHelper.GetParent(current);
            }
        }
        catch { }

        return false;
    }

    private void ContactRow_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        try
        {
            if (IsEventFromButtonOrInteractive(e.OriginalSource as DependencyObject))
            {
                return;
            }

            CancelContactLongPress();
            _contactLongPressCts = new CancellationTokenSource();
            var token = _contactLongPressCts.Token;
            _contactLongPressTriggered = false;

            if (sender is not Border border)
            {
                return;
            }

            var contact = border.DataContext as MainViewModel.ContactViewModel;
            if (contact == null)
            {
                return;
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(ContactLongPressMs, token);
                    if (token.IsCancellationRequested) return;

                    _contactLongPressTriggered = true;

                    await Dispatcher.InvokeAsync(() =>
                    {
                        try
                        {
                            if (ViewModel?.AddDirectContactForUserCommand != null
                                && ViewModel.AddDirectContactForUserCommand.CanExecute(contact))
                            {
                                ViewModel.AddDirectContactForUserCommand.Execute(contact);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger?.LogDebug(ex, "MainWindow: long-press add direct contact failed");
                        }
                    });
                }
                catch (TaskCanceledException)
                {
                    // ignored
                }
                catch (Exception ex)
                {
                    _logger?.LogDebug(ex, "MainWindow: long-press task failed");
                }
            });
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "MainWindow: ContactRow_PreviewMouseLeftButtonDown failed");
        }
    }

    private void ContactRow_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        try
        {
            if (_contactLongPressTriggered)
            {
                e.Handled = true;
            }
        }
        catch { }
        finally
        {
            CancelContactLongPress();
        }
    }

    private void ContactRow_MouseLeave(object sender, MouseEventArgs e)
    {
        CancelContactLongPress();
    }

    private void CancelDirectContactLongPress()
    {
        try
        {
            _directContactLongPressCts?.Cancel();
            _directContactLongPressCts?.Dispose();
        }
        catch { }
        finally
        {
            _directContactLongPressCts = null;
            _directContactLongPressTriggered = false;
        }
    }

    private void DirectContactRow_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        try
        {
            // Don't treat presses on the Voice/Video buttons as delete gestures.
            if (IsEventFromButtonOrInteractive(e.OriginalSource as DependencyObject))
            {
                return;
            }

            CancelDirectContactLongPress();
            _directContactLongPressCts = new CancellationTokenSource();
            var token = _directContactLongPressCts.Token;
            _directContactLongPressTriggered = false;

            if (sender is not Border border)
            {
                return;
            }

            var slot = border.DataContext as MainViewModel.DirectContactSlotViewModel;
            var contact = slot?.Contact;
            if (contact == null)
            {
                return;
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(ContactLongPressMs, token);
                    if (token.IsCancellationRequested) return;

                    _directContactLongPressTriggered = true;

                    await Dispatcher.InvokeAsync(() =>
                    {
                        try
                        {
                            var name = (contact.Name ?? string.Empty).Trim();
                            var label = string.IsNullOrWhiteSpace(name) ? "this direct contact" : $"\"{name}\"";
                            var result = MessageBox.Show(
                                $"Delete {label}?",
                                "Delete Direct Contact",
                                MessageBoxButton.YesNo,
                                MessageBoxImage.Warning);

                            if (result != MessageBoxResult.Yes)
                            {
                                return;
                            }

                            if (ViewModel?.DeleteDirectContactCommand != null
                                && ViewModel.DeleteDirectContactCommand.CanExecute(contact))
                            {
                                ViewModel.DeleteDirectContactCommand.Execute(contact);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger?.LogDebug(ex, "MainWindow: long-press delete direct contact failed");
                        }
                    });
                }
                catch (TaskCanceledException)
                {
                    // ignored
                }
                catch (Exception ex)
                {
                    _logger?.LogDebug(ex, "MainWindow: long-press direct contact task failed");
                }
            });
        }
        catch (Exception ex)
        {
            _logger?.LogDebug(ex, "MainWindow: DirectContactRow_PreviewMouseLeftButtonDown failed");
        }
    }

    private void DirectContactRow_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        try
        {
            if (_directContactLongPressTriggered)
            {
                e.Handled = true;
            }
        }
        catch { }
        finally
        {
            CancelDirectContactLongPress();
        }
    }

    private void DirectContactRow_MouseLeave(object sender, MouseEventArgs e)
    {
        CancelDirectContactLongPress();
    }
}