using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace TradePulse.Client.Core.Services;

public sealed class BroadcastRtpBridgeService : IBroadcastRtpBridgeService
{
    private readonly ILogger<BroadcastRtpBridgeService> _logger;
    private readonly IServiceProvider _serviceProvider;

    private readonly ConcurrentDictionary<string, RtpOpusBridgeService> _bridges = new(StringComparer.OrdinalIgnoreCase);

    public BroadcastRtpBridgeService(ILogger<BroadcastRtpBridgeService> logger, IServiceProvider serviceProvider)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
    }

    public bool IsRunning(string groupId)
    {
        if (string.IsNullOrWhiteSpace(groupId)) return false;
        if (!_bridges.TryGetValue(groupId, out var b)) return false;
        return b.IsRunning;
    }

    public async Task StartTransmitAsync(string groupId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(groupId)) return;
        var bridge = _bridges.GetOrAdd(groupId, _ => CreateBridge());
        await bridge.StartAsync(groupId, cancellationToken);
    }

    public async Task StartReceiveOnlyAsync(string groupId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(groupId)) return;
        var bridge = _bridges.GetOrAdd(groupId, _ => CreateBridge());
        await bridge.StartReceiveOnlyAsync(groupId, cancellationToken);
    }

    public async Task StopAsync(string groupId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(groupId)) return;

        if (_bridges.TryRemove(groupId, out var bridge))
        {
            try
            {
                await bridge.StopAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed stopping RTP bridge. groupId={GroupId}", groupId);
            }

            try
            {
                bridge.Dispose();
            }
            catch { }
        }
    }

    public async Task StopAllAsync(CancellationToken cancellationToken = default)
    {
        var keys = _bridges.Keys.ToList();
        foreach (var groupId in keys)
        {
            try
            {
                await StopAsync(groupId, cancellationToken);
            }
            catch { }
        }
    }

    private RtpOpusBridgeService CreateBridge()
    {
        // RtpOpusBridgeService is registered as IRtpBridgeService, but we need the concrete type to dispose cleanly.
        // Use DI to satisfy its dependencies.
        var b = ActivatorUtilities.CreateInstance<RtpOpusBridgeService>(_serviceProvider);
        return b;
    }
}
