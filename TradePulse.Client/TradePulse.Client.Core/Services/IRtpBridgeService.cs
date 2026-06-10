using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface IRtpBridgeService
{
    bool IsRunning { get; }

    Task StartAsync(string callId, CancellationToken cancellationToken = default);
    Task StartReceiveOnlyAsync(string callId, CancellationToken cancellationToken = default);
    Task StopAsync(CancellationToken cancellationToken = default);
}
