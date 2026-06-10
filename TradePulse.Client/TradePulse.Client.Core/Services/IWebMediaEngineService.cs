namespace TradePulse.Client.Core.Services;

public interface IWebMediaEngineService
{
    Task EnsureInitializedAsync(CancellationToken cancellationToken = default);
    Task StartCallAsync(string callId, bool enableVideo, CancellationToken cancellationToken = default);
    Task StopCallAsync(string callId, CancellationToken cancellationToken = default);
    Task SetMutedAsync(bool muted, CancellationToken cancellationToken = default);
    Task StopAllAsync(CancellationToken cancellationToken = default);
}
