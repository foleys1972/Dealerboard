namespace TradePulse.Client.Core.Services;

public interface ILineRtpBridgeService
{
    string? ActiveMediaGroupId { get; }

    bool IsRunning { get; }

    Task StartLineCallAsync(string mediaGroupId, CancellationToken cancellationToken = default);

    Task StartMonitorAsync(string lineId, string mediaGroupId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Push-to-talk on a monitored line: true adds the mic uplink to the existing
    /// monitor session (without touching the live listen downlink); false drops
    /// the uplink and returns to listen-only.
    /// </summary>
    Task SetMonitorTalkAsync(string lineId, bool talk, CancellationToken cancellationToken = default);

    Task StopMonitorAsync(string lineId, CancellationToken cancellationToken = default);

    Task StopAsync(CancellationToken cancellationToken = default);

    Task StopAllAsync(CancellationToken cancellationToken = default);
}
