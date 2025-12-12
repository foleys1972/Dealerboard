using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace TradePulse.Client.Core.Services;

public class AudioStreamingService : IAudioStreamingService, IDisposable
{
    private readonly ILogger<AudioStreamingService> _logger;
    private readonly ISocketService _socketService;
    private readonly IAudioService _audioService;
    private string? _currentCallId;
    private bool _isStreaming = false;
    private bool _disposed = false;

    public bool IsStreaming => _isStreaming;

    public event EventHandler<byte[]>? AudioDataReceived;

    public AudioStreamingService(
        ILogger<AudioStreamingService> logger,
        ISocketService socketService,
        IAudioService audioService)
    {
        _logger = logger;
        _socketService = socketService;
        _audioService = audioService;

        // Subscribe to audio service events
        _audioService.AudioDataAvailable += OnAudioDataAvailable;
        
        // Subscribe to socket events for incoming audio
        _socketService.On("audio-data", OnSocketAudioData);
        _socketService.On("call-audio", OnSocketAudioData); // Alternative event name
    }

    public async Task StartStreamingAsync(string callId)
    {
        if (_isStreaming)
        {
            _logger.LogWarning("Already streaming audio");
            return;
        }

        try
        {
            _currentCallId = callId;
            _isStreaming = true;

            // Initialize audio service
            await _audioService.InitializeAsync();
            
            // Start recording
            await _audioService.StartRecordingAsync();

            _logger.LogInformation("Audio streaming started for call: {CallId}", callId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start audio streaming");
            _isStreaming = false;
            throw;
        }
    }

    public async Task StopStreamingAsync()
    {
        if (!_isStreaming)
        {
            return;
        }

        try
        {
            await _audioService.StopRecordingAsync();
            _isStreaming = false;
            _currentCallId = null;

            _logger.LogInformation("Audio streaming stopped");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to stop audio streaming");
        }
    }

    public async Task SendAudioDataAsync(byte[] audioData)
    {
        if (!_isStreaming || string.IsNullOrEmpty(_currentCallId))
        {
            return;
        }

        try
        {
            // Send audio data via Socket.IO
            await _socketService.EmitAsync("audio-data", new
            {
                callId = _currentCallId,
                audioData = Convert.ToBase64String(audioData),
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send audio data");
        }
    }

    public void SetVolume(float volume)
    {
        _audioService.OutputVolume = volume;
    }

    private void OnAudioDataAvailable(object? sender, byte[] audioData)
    {
        if (!_isStreaming || _audioService.IsMuted)
        {
            return;
        }

        // Send audio data to server
        _ = Task.Run(async () =>
        {
            try
            {
                await SendAudioDataAsync(audioData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending audio data");
            }
        });
    }

    private void OnSocketAudioData(object data)
    {
        try
        {
            // Parse incoming audio data from Socket.IO
            // Socket.IO client returns data in various formats, handle both
            string json;
            if (data is string str)
            {
                json = str;
            }
            else
            {
                json = JsonSerializer.Serialize(data);
            }

            var audioMessage = JsonSerializer.Deserialize<AudioMessage>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (audioMessage == null || string.IsNullOrEmpty(audioMessage.CallId))
            {
                return;
            }

            // Only process audio for current call
            if (audioMessage.CallId != _currentCallId)
            {
                return;
            }

            // Decode base64 audio data
            if (string.IsNullOrEmpty(audioMessage.AudioData))
            {
                return;
            }

            var audioBytes = Convert.FromBase64String(audioMessage.AudioData);

            // Play audio through NAudio
            _ = Task.Run(async () =>
            {
                try
                {
                    await _audioService.PlayAudioAsync(audioBytes);
                    AudioDataReceived?.Invoke(this, audioBytes);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error playing audio data");
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing socket audio data: {Error}", ex.Message);
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            StopStreamingAsync().Wait(TimeSpan.FromSeconds(2));
            _audioService.AudioDataAvailable -= OnAudioDataAvailable;
            _socketService.Off("audio-data");
            _socketService.Off("call-audio");
            _disposed = true;
        }
    }

    private class AudioMessage
    {
        public string CallId { get; set; } = string.Empty;
        public string AudioData { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }
}

