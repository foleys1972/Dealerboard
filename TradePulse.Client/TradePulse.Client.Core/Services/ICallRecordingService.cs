using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface ICallRecordingService
{
    bool IsRecording { get; }

    bool IsRecordingSession(string sessionKey);

    int VoiceVoxSilenceSeconds { get; }

    Task RefreshClientConfigAsync(CancellationToken cancellationToken = default);

    Task StartAsync(Call call, string? sessionKey = null, CancellationToken cancellationToken = default);
    Task AppendPcmAsync(string sessionKey, byte[] pcm, CancellationToken cancellationToken = default);
    Task StopAndUploadAsync(string reason, string? sessionKey = null, CancellationToken cancellationToken = default);

    Task ReconcilePendingUploadsAsync(CancellationToken cancellationToken = default);
}
