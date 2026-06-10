using Microsoft.Extensions.Logging;
using System.Text.Json;
using Newtonsoft.Json;

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
        // Cheap bail-out before any parsing: this runs per audio frame (~50/sec).
        if (string.IsNullOrWhiteSpace(_currentCallId))
        {
            return;
        }

        try
        {
            // Socket.IO payloads arrive as JsonElement on the hot path; raw JSON
            // strings or other object shapes are rare fallbacks. Extract fields with
            // a single System.Text.Json pass instead of round-tripping through JToken.
            string? callId;
            string? audioDataB64;
            if (data is JsonElement je)
            {
                if (!TryExtractAudioFields(je, out callId, out audioDataB64)) return;
            }
            else if (data is string s)
            {
                using var doc = JsonDocument.Parse(s);
                if (!TryExtractAudioFields(doc.RootElement, out callId, out audioDataB64)) return;
            }
            else
            {
                using var doc = JsonDocument.Parse(JsonConvert.SerializeObject(data));
                if (!TryExtractAudioFields(doc.RootElement, out callId, out audioDataB64)) return;
            }

            // Only process audio for current call
            if (string.IsNullOrWhiteSpace(callId) ||
                !string.Equals(callId, _currentCallId, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(audioDataB64))
            {
                return;
            }

            var audioBytes = Convert.FromBase64String(audioDataB64);

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

    private static bool TryExtractAudioFields(JsonElement element, out string? callId, out string? audioDataB64)
    {
        callId = null;
        audioDataB64 = null;

        // Unwrap [payload] and "stringified json" wrappers.
        if (element.ValueKind == JsonValueKind.Array)
        {
            if (element.GetArrayLength() == 0) return false;
            element = element[0];
        }

        if (element.ValueKind == JsonValueKind.String)
        {
            var inner = element.GetString();
            if (string.IsNullOrWhiteSpace(inner)) return false;
            using var doc = JsonDocument.Parse(inner);
            return TryExtractAudioFields(doc.RootElement, out callId, out audioDataB64);
        }

        if (element.ValueKind != JsonValueKind.Object) return false;

        foreach (var prop in element.EnumerateObject())
        {
            if (callId is null && string.Equals(prop.Name, "callId", StringComparison.OrdinalIgnoreCase))
            {
                callId = prop.Value.ValueKind == JsonValueKind.String ? prop.Value.GetString() : prop.Value.ToString();
            }
            else if (audioDataB64 is null && string.Equals(prop.Name, "audioData", StringComparison.OrdinalIgnoreCase))
            {
                audioDataB64 = prop.Value.ValueKind == JsonValueKind.String ? prop.Value.GetString() : prop.Value.ToString();
            }

            if (callId is not null && audioDataB64 is not null) break;
        }

        return true;
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

}

