using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Management;
using System.Threading.Tasks;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;
using TradePulse.Client.Core.Services;

namespace TradePulse.Client.WPF.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly ILogger<SettingsViewModel> _logger;
    private readonly IAudioService _audioService;
    private readonly IConfigurationService _configService;

    [ObservableProperty]
    private ObservableCollection<AudioDevice> _inputDevices = new();

    [ObservableProperty]
    private ObservableCollection<AudioDevice> _outputDevices = new();

    [ObservableProperty]
    private ObservableCollection<VideoDevice> _videoDevices = new();

    [ObservableProperty]
    private AudioDevice? _selectedInputDevice;

    [ObservableProperty]
    private AudioDevice? _selectedOutputDevice;

    [ObservableProperty]
    private VideoDevice? _selectedVideoDevice;

    [ObservableProperty]
    private float _inputVolume = 1.0f;

    [ObservableProperty]
    private float _outputVolume = 1.0f;

    [ObservableProperty]
    private bool _isRefreshing;

    [ObservableProperty]
    private bool _allowInsecureCertificates;

    public SettingsViewModel(
        ILogger<SettingsViewModel> logger,
        IAudioService audioService,
        IConfigurationService configService)
    {
        _logger = logger;
        _audioService = audioService;
        _configService = configService;

        // Load saved settings
        LoadSettings();
    }

    private void LoadSettings()
    {
        // Load saved device selections from config
        var savedInputDeviceIndex = _configService.GetValue<int?>("AudioInputDeviceIndex");
        var savedOutputDeviceIndex = _configService.GetValue<int?>("AudioOutputDeviceIndex");
        var savedVideoDeviceId = _configService.GetValue<string?>("VideoDeviceId");
        
        InputVolume = _configService.GetValue<float?>("InputVolume") ?? 1.0f;
        OutputVolume = _configService.GetValue<float?>("OutputVolume") ?? 1.0f;

        AllowInsecureCertificates = _configService.AllowInsecureCertificates;

        // Refresh devices and restore selections
        RefreshDevicesAsync().ContinueWith(_ =>
        {
            if (savedInputDeviceIndex.HasValue && savedInputDeviceIndex.Value < InputDevices.Count)
            {
                SelectedInputDevice = InputDevices[savedInputDeviceIndex.Value];
            }

            if (savedOutputDeviceIndex.HasValue && savedOutputDeviceIndex.Value < OutputDevices.Count)
            {
                SelectedOutputDevice = OutputDevices[savedOutputDeviceIndex.Value];
            }

            if (!string.IsNullOrEmpty(savedVideoDeviceId))
            {
                SelectedVideoDevice = VideoDevices.FirstOrDefault(v => v.Id == savedVideoDeviceId);
            }
        });
    }

    [RelayCommand]
    private async Task RefreshDevicesAsync()
    {
        IsRefreshing = true;
        try
        {
            await Task.Run(() =>
            {
                // Refresh audio devices
                var inputDevices = _audioService.GetInputDevices();
                var outputDevices = _audioService.GetOutputDevices();
                
                // Refresh video devices
                var videoDevices = GetVideoDevices();

                // Update on UI thread
                System.Windows.Application.Current.Dispatcher.Invoke(() =>
                {
                    InputDevices.Clear();
                    foreach (var device in inputDevices)
                    {
                        InputDevices.Add(device);
                    }

                    OutputDevices.Clear();
                    foreach (var device in outputDevices)
                    {
                        OutputDevices.Add(device);
                    }

                    VideoDevices.Clear();
                    foreach (var device in videoDevices)
                    {
                        VideoDevices.Add(device);
                    }
                });
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refresh devices");
        }
        finally
        {
            IsRefreshing = false;
        }
    }

    [RelayCommand]
    private async Task SaveSettingsAsync()
    {
        try
        {
            // Save device selections
            if (SelectedInputDevice != null)
            {
                _configService.SetValue("AudioInputDeviceIndex", SelectedInputDevice.Index);
                await _audioService.SetInputDeviceAsync(SelectedInputDevice.Index);
            }

            if (SelectedOutputDevice != null)
            {
                _configService.SetValue("AudioOutputDeviceIndex", SelectedOutputDevice.Index);
                await _audioService.SetOutputDeviceAsync(SelectedOutputDevice.Index);
            }

            if (SelectedVideoDevice != null)
            {
                _configService.SetValue("VideoDeviceId", SelectedVideoDevice.Id);
            }

            // Save volumes
            _configService.SetValue("InputVolume", InputVolume);
            _configService.SetValue("OutputVolume", OutputVolume);

            _configService.AllowInsecureCertificates = AllowInsecureCertificates;

            _configService.Save();

            _logger.LogInformation("Settings saved successfully");
            
            // Close the window (handled by the view)
            RequestClose?.Invoke();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save settings");
            System.Windows.MessageBox.Show(
                $"Failed to save settings: {ex.Message}",
                "Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
    }

    public event Action? RequestClose;

    private List<VideoDevice> GetVideoDevices()
    {
        var devices = new List<VideoDevice>();
        try
        {
            // Enumerate cameras using WMI. This avoids WinRT/Windows SDK platform version issues.
            // Note: this provides detection/listing; actual capture is still performed by the WebView2 engine.
            // Different OEM drivers surface devices differently, so we try multiple queries.

            var queries = new[]
            {
                // Most USB webcams
                "SELECT PNPDeviceID, Name FROM Win32_PnPEntity WHERE Service = 'usbvideo'",
                // Some machines expose PNPClass
                "SELECT PNPDeviceID, Name FROM Win32_PnPEntity WHERE (PNPClass = 'Image' OR PNPClass = 'Camera')",
                // Camera device interface class GUID
                "SELECT PNPDeviceID, Name FROM Win32_PnPEntity WHERE ClassGuid = '{CA3E7AB9-B4C3-4AE6-8251-579EF933890F}'",
            };

            foreach (var q in queries)
            {
                try
                {
                    using var searcher = new ManagementObjectSearcher(q);
                    foreach (var o in searcher.Get())
                    {
                        if (o is not ManagementObject mo) continue;

                        var id = (mo["PNPDeviceID"] as string) ?? string.Empty;
                        var name = (mo["Name"] as string) ?? string.Empty;

                        if (string.IsNullOrWhiteSpace(name))
                        {
                            continue;
                        }

                        devices.Add(new VideoDevice
                        {
                            Id = id,
                            Name = name
                        });
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Video device enumeration query failed: {Query}", q);
                }
            }

            devices = devices
                .GroupBy(d => string.IsNullOrWhiteSpace(d.Id) ? d.Name : d.Id, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .OrderBy(d => d.Name)
                .ToList();

            if (devices.Count == 0)
            {
                _logger.LogWarning("No video capture devices found (0 cameras detected). This may be due to missing drivers, disabled device, or OS privacy restrictions.");
            }
            else
            {
                _logger.LogInformation("Detected {Count} video capture device(s): {Devices}",
                    devices.Count,
                    string.Join(" | ", devices.Select(d => $"{d.Name} ({d.Id})")));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enumerate video devices");
        }
        return devices;
    }

    partial void OnInputVolumeChanged(float value)
    {
        _audioService.InputVolume = value;
    }

    partial void OnOutputVolumeChanged(float value)
    {
        _audioService.OutputVolume = value;
    }
}

public class VideoDevice
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

