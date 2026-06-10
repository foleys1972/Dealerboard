using Microsoft.Extensions.Logging;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using NAudio.CoreAudioApi;

namespace TradePulse.Client.Core.Services;

public class AudioService : IAudioService, IDisposable
{
    private readonly ILogger<AudioService> _logger;
    private WasapiCapture? _waveIn;
    private WasapiOut? _waveOut;
    private BufferedWaveProvider? _bufferedWaveProvider;
    private readonly WaveFormat _waveFormat = new WaveFormat(48000, 16, 2); // 48kHz, 16-bit, stereo
    private bool _disposed = false;
    private bool _isRecording = false;
    private float _inputVolume = 1.0f;
    private float _outputVolume = 1.0f;
    private bool _isMuted = false;
    private int _inputDeviceIndex = 0;
    private int _outputDeviceIndex = 0;
    private List<MMDevice> _inputDevices = new();
    private List<MMDevice> _outputDevices = new();

    public bool IsInitialized { get; private set; }
    public bool IsRecording => _isRecording;
    public bool IsPlaying => _waveOut?.PlaybackState == PlaybackState.Playing;
    public float InputVolume
    {
        get => _inputVolume;
        set => _inputVolume = Math.Clamp(value, 0f, 1f);
    }
    public float OutputVolume
    {
        get => _outputVolume;
        set
        {
            _outputVolume = Math.Clamp(value, 0f, 1f);
            if (_waveOut != null)
            {
                _waveOut.Volume = _outputVolume;
            }
        }
    }
    public bool IsMuted
    {
        get => _isMuted;
        set => _isMuted = value;
    }

    public event EventHandler<byte[]>? AudioDataAvailable;
    public event EventHandler<byte[]>? PlaybackAudioAvailable;
    public event EventHandler<float>? AudioLevelChanged;

    public AudioService(ILogger<AudioService> logger)
    {
        _logger = logger;
    }

    public Task InitializeAsync()
    {
        if (IsInitialized)
        {
            return Task.CompletedTask;
        }

        try
        {
            // Initialize audio devices
            IsInitialized = true;
            _logger.LogInformation("Audio service initialized");
            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize audio service");
            throw;
        }
    }

    public Task StartRecordingAsync()
    {
        if (_waveIn != null && IsRecording)
        {
            return Task.CompletedTask;
        }

        try
        {
            var device = GetSelectedInputDevice();
            if (device != null)
            {
                try
                {
                    _waveIn = new WasapiCapture(device);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to start capture on selected input device. Falling back to default device. deviceIndex={Index} device={Device}", _inputDeviceIndex, device.FriendlyName);
                    _waveIn = new WasapiCapture();
                }
            }
            else
            {
                _waveIn = new WasapiCapture();
            }
            _waveIn.WaveFormat = _waveFormat;

            _waveIn.DataAvailable += OnDataAvailable;
            _waveIn.RecordingStopped += OnRecordingStopped;

            _waveIn.StartRecording();
            _isRecording = true;
            _logger.LogInformation("Audio recording started");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start recording");
            throw;
        }

        return Task.CompletedTask;
    }

    public Task StopRecordingAsync()
    {
        if (_waveIn != null)
        {
            _waveIn.StopRecording();
            _waveIn.Dispose();
            _waveIn = null;
            _isRecording = false;
            _logger.LogInformation("Audio recording stopped");
        }

        return Task.CompletedTask;
    }

    public Task PlayAudioAsync(byte[] audioData)
    {
        try
        {
            try
            {
                PlaybackAudioAvailable?.Invoke(this, audioData);
            }
            catch (Exception ex)
            {
                // A failing subscriber (e.g. recording sink) must not kill playback,
                // but it must be visible — silent drops here are undiagnosable.
                _logger.LogError(ex, "PlaybackAudioAvailable subscriber threw; playback continues");
            }

            if (_waveOut == null)
            {
                var device = GetSelectedOutputDevice();
                _waveOut = device != null
                    ? new WasapiOut(device, AudioClientShareMode.Shared, true, 20)
                    : new WasapiOut(AudioClientShareMode.Shared, true, 20);

                _bufferedWaveProvider = new BufferedWaveProvider(_waveFormat)
                {
                    BufferLength = _waveFormat.AverageBytesPerSecond, // 1 second buffer
                    DiscardOnBufferOverflow = true,
                    // Ensure reads always return full buffers (pads with zeros on underrun)
                    // so the output device doesn't stop/restart and pop/click when audio resumes.
                    ReadFully = true
                };

                _waveOut.Init(_bufferedWaveProvider);
                _waveOut.Volume = _outputVolume;
                _logger.LogInformation("Audio playback initialized. deviceIndex={Index} device={Device}", _outputDeviceIndex, device?.FriendlyName ?? "<default>");
            }

            if (_bufferedWaveProvider != null)
            {
                _bufferedWaveProvider.AddSamples(audioData, 0, audioData.Length);
            }

            if (_waveOut.PlaybackState != PlaybackState.Playing)
            {
                _waveOut.Play();
                _logger.LogInformation("Audio playback started. volume={Volume}", _outputVolume);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to play audio");
        }

        return Task.CompletedTask;
    }

    public Task SetInputDeviceAsync(int deviceIndex)
    {
        _inputDeviceIndex = Math.Max(0, deviceIndex);

        // Stop current recording if active
        if (IsRecording)
        {
            StopRecordingAsync().Wait();
        }

        // Device will be set when starting recording
        return Task.CompletedTask;
    }

    public Task SetOutputDeviceAsync(int deviceIndex)
    {
        _outputDeviceIndex = Math.Max(0, deviceIndex);

        // Stop current playback if active
        if (_waveOut != null)
        {
            _waveOut.Stop();
            _waveOut.Dispose();
            _waveOut = null;
            _bufferedWaveProvider = null;
        }

        return Task.CompletedTask;
    }

    public List<AudioDevice> GetInputDevices()
    {
        var devices = new List<AudioDevice>();
        
        try
        {
            var enumerator = new MMDeviceEnumerator();
            _inputDevices = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active).ToList();

            for (int i = 0; i < _inputDevices.Count; i++)
            {
                var device = _inputDevices[i];
                devices.Add(new AudioDevice
                {
                    Index = i,
                    Name = device.FriendlyName,
                    Channels = _waveFormat.Channels,
                    SampleRate = _waveFormat.SampleRate
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enumerate input devices");
        }

        return devices;
    }

    public List<AudioDevice> GetOutputDevices()
    {
        var devices = new List<AudioDevice>();
        
        try
        {
            var enumerator = new MMDeviceEnumerator();
            _outputDevices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active).ToList();

            for (int i = 0; i < _outputDevices.Count; i++)
            {
                var device = _outputDevices[i];
                devices.Add(new AudioDevice
                {
                    Index = i,
                    Name = device.FriendlyName,
                    Channels = _waveFormat.Channels,
                    SampleRate = _waveFormat.SampleRate
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enumerate output devices");
        }

        return devices;
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (e.BytesRecorded == 0)
        {
            return;
        }

        var bytesToCopy = Math.Min(e.BytesRecorded, e.Buffer?.Length ?? 0);
        if (bytesToCopy <= 0)
        {
            return;
        }

        var audioData = new byte[bytesToCopy];

        if (_isMuted)
        {
            AudioLevelChanged?.Invoke(this, 0f);
            AudioDataAvailable?.Invoke(this, audioData);
            return;
        }

        Array.Copy(e.Buffer, 0, audioData, 0, bytesToCopy);

        // Apply input volume
        if (_inputVolume < 1.0f)
        {
            ApplyVolume(audioData, _inputVolume);
        }

        // Calculate audio level for visualization
        var level = CalculateAudioLevel(audioData);
        AudioLevelChanged?.Invoke(this, level);

        // Emit audio data
        AudioDataAvailable?.Invoke(this, audioData);
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs e)
    {
        _isRecording = false;
        _logger.LogInformation("Recording stopped: {Exception}", e.Exception?.Message);
    }

    private void ApplyVolume(byte[] audioData, float volume)
    {
        for (int i = 0; i + 1 < audioData.Length; i += 2)
        {
            short sample = BitConverter.ToInt16(audioData, i);
            sample = (short)(sample * volume);
            byte[] bytes = BitConverter.GetBytes(sample);
            audioData[i] = bytes[0];
            audioData[i + 1] = bytes[1];
        }
    }

    private float CalculateAudioLevel(byte[] audioData)
    {
        if (audioData.Length < 2) return 0f;

        float sum = 0f;
        int sampleCount = 0;

        for (int i = 0; i < audioData.Length - 1; i += 2)
        {
            short sample = BitConverter.ToInt16(audioData, i);
            float normalized = Math.Abs(sample / 32768f);
            sum += normalized;
            sampleCount++;
        }

        return sampleCount > 0 ? sum / sampleCount : 0f;
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            StopRecordingAsync().Wait(TimeSpan.FromSeconds(1));
            
            _waveOut?.Stop();
            _waveOut?.Dispose();
            _waveOut = null;
            _bufferedWaveProvider = null;

            _disposed = true;
        }
    }

    private MMDevice? GetSelectedInputDevice()
    {
        try
        {
            if (_inputDevices == null || _inputDevices.Count == 0)
            {
                _ = GetInputDevices();
            }
            if (_inputDevices != null && _inputDeviceIndex >= 0 && _inputDeviceIndex < _inputDevices.Count)
            {
                return _inputDevices[_inputDeviceIndex];
            }
        }
        catch { }
        return null;
    }

    private MMDevice? GetSelectedOutputDevice()
    {
        try
        {
            if (_outputDevices == null || _outputDevices.Count == 0)
            {
                _ = GetOutputDevices();
            }

            // If the user hasn't explicitly selected a device, prefer the OS default.
            // Index 0 is not reliably the default and is often HDMI/monitor audio.
            if (_outputDeviceIndex == 0)
            {
                try
                {
                    var enumerator = new MMDeviceEnumerator();
                    return enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                }
                catch
                {
                    // Fall back to list-based selection below.
                }
            }

            if (_outputDevices != null && _outputDeviceIndex >= 0 && _outputDeviceIndex < _outputDevices.Count)
            {
                return _outputDevices[_outputDeviceIndex];
            }
        }
        catch { }
        return null;
    }
}

