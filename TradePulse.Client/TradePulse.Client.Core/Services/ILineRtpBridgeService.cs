namespace TradePulse.Client.Core.Services;

public interface ILineRtpBridgeService
{
    string? ActiveMediaGroupId { get; }

    bool IsRunning { get; }

    Task StartLineCallAsync(string mediaGroupId, CancellationToken cancellationToken = default);

    Task StartMonitorAsync(string lineId, string mediaGroupId, CancellationToken cancellationToken = default);

    Task StopMonitorAsync(string lineId, CancellationToken cancellationToken = default);

    Task StopAsync(CancellationToken cancellationToken = default);

    Task StopAllAsync(CancellationToken cancellationToken = default);
}
