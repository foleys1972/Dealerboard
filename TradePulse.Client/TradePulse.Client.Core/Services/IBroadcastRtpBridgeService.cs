using System.Threading;

namespace TradePulse.Client.Core.Services;

public interface IBroadcastRtpBridgeService
{
    Task StartTransmitAsync(string groupId, CancellationToken cancellationToken = default);
    Task StartReceiveOnlyAsync(string groupId, CancellationToken cancellationToken = default);
    Task StopAsync(string groupId, CancellationToken cancellationToken = default);
    Task StopAllAsync(CancellationToken cancellationToken = default);

    bool IsRunning(string groupId);
}
