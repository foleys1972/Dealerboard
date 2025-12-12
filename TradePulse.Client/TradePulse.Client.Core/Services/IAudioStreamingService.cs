namespace TradePulse.Client.Core.Services;

public interface IAudioStreamingService
{
    bool IsStreaming { get; }
    
    event EventHandler<byte[]>? AudioDataReceived;
    
    Task StartStreamingAsync(string callId);
    Task StopStreamingAsync();
    Task SendAudioDataAsync(byte[] audioData);
    void SetVolume(float volume);
}

