namespace TradePulse.Client.Core.Services;

public interface IAudioService
{
    bool IsInitialized { get; }
    bool IsRecording { get; }
    bool IsPlaying { get; }
    float InputVolume { get; set; }
    float OutputVolume { get; set; }
    bool IsMuted { get; set; }
    
    event EventHandler<byte[]>? AudioDataAvailable;
    event EventHandler<byte[]>? PlaybackAudioAvailable;
    event EventHandler<float>? AudioLevelChanged;
    
    Task InitializeAsync();
    Task StartRecordingAsync();
    Task StopRecordingAsync();
    Task PlayAudioAsync(byte[] audioData);
    Task SetInputDeviceAsync(int deviceIndex);
    Task SetOutputDeviceAsync(int deviceIndex);
    List<AudioDevice> GetInputDevices();
    List<AudioDevice> GetOutputDevices();
    void Dispose();
}

public class AudioDevice
{
    public int Index { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Channels { get; set; }
    public int SampleRate { get; set; }
}

