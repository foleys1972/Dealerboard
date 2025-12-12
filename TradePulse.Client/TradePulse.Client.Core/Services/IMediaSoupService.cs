using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface IMediaSoupService
{
    bool IsInitialized { get; }
    bool IsConnected { get; }
    
    event EventHandler<bool>? ConnectionStateChanged;
    event EventHandler<string>? Error;
    
    Task InitializeAsync();
    Task<MediaSoupTransport> CreateTransportAsync(string direction = "sendrecv", string? groupId = null);
    Task ConnectTransportAsync(string transportId, object dtlsParameters);
    Task<MediaSoupProducer> ProduceAsync(string transportId, MediaStreamTrack track, string? groupId = null);
    Task<MediaSoupConsumer> ConsumeAsync(string transportId, string producerId, string? groupId = null);
    Task CloseTransportAsync(string transportId);
    Task CloseProducerAsync(string producerId);
    Task CloseConsumerAsync(string consumerId);
    Task CleanupAsync();
}

public class MediaSoupTransport
{
    public string Id { get; set; } = string.Empty;
    public object IceParameters { get; set; } = new();
    public List<object> IceCandidates { get; set; } = new();
    public object DtlsParameters { get; set; } = new();
    public object? SctpParameters { get; set; }
}

public class MediaSoupProducer
{
    public string Id { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty; // "audio" or "video"
    public object RtpParameters { get; set; } = new();
}

public class MediaSoupConsumer
{
    public string Id { get; set; } = string.Empty;
    public string ProducerId { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty; // "audio" or "video"
    public object RtpParameters { get; set; } = new();
}

public class MediaStreamTrack
{
    public string Kind { get; set; } = string.Empty; // "audio" or "video"
    public object? NativeTrack { get; set; } // Platform-specific track (e.g., NAudio WaveInEvent for audio)
}

