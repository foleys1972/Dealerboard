using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
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
            // Use Windows Media Foundation to enumerate video devices
            // This requires P/Invoke or a library - for now, return empty list
            // TODO: Implement video device enumeration using Windows APIs
            _logger.LogInformation("Video device enumeration not yet implemented");
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

