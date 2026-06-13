using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Linq;

namespace TradePulse.Client.Core.Services;

/// <summary>
/// RTP/Opus bridge for dealerboard private wire and DDI line calls.
/// Supports one full-duplex line call plus multiple receive-only monitor sessions.
/// </summary>
public sealed class LineRtpBridgeService : ILineRtpBridgeService, IDisposable
{
    private readonly ILogger<LineRtpBridgeService> _logger;
    private readonly IServiceProvider _serviceProvider;
    private readonly object _lock = new();

    private RtpOpusBridgeService? _callBridge;
    private string? _activeCallMediaGroupId;
    private readonly Dictionary<string, RtpOpusBridgeService> _monitorBridges = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _monitorMediaGroupIds = new(StringComparer.OrdinalIgnoreCase);

    public LineRtpBridgeService(ILogger<LineRtpBridgeService> logger, IServiceProvider serviceProvider)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
    }

    public string? ActiveMediaGroupId
    {
        get
        {
            lock (_lock) return _activeCallMediaGroupId;
        }
    }

    public bool IsRunning
    {
        get
        {
            lock (_lock)
            {
                return _callBridge?.IsRunning == true || _monitorBridges.Values.Any(b => b.IsRunning);
            }
        }
    }

    public async Task StartLineCallAsync(string mediaGroupId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(mediaGroupId)) return;

        RtpOpusBridgeService? existingBridge;
        lock (_lock)
        {
            if (_callBridge != null
                && _callBridge.IsRunning
                && string.Equals(_activeCallMediaGroupId, mediaGroupId, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
            existingBridge = _callBridge;
            _callBridge = null;
            _activeCallMediaGroupId = null;
        }

        await DisposeBridgeAsync(existingBridge, cancellationToken);

        var bridge = ActivatorUtilities.CreateInstance<RtpOpusBridgeService>(_serviceProvider);
        lock (_lock)
        {
            _callBridge = bridge;
            _activeCallMediaGroupId = mediaGroupId;
        }

        try
        {
            await bridge.StartAsync(mediaGroupId, cancellationToken);
            _logger.LogInformation("Line call RTP bridge started. mediaGroupId={MediaGroupId}", mediaGroupId);
        }
        catch
        {
            lock (_lock)
            {
                if (ReferenceEquals(_callBridge, bridge))
                {
                    _callBridge = null;
                    _activeCallMediaGroupId = null;
                }
            }
            await DisposeBridgeAsync(bridge, cancellationToken);
            throw;
        }
    }

    public async Task StartMonitorAsync(string lineId, string mediaGroupId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(lineId) || string.IsNullOrWhiteSpace(mediaGroupId)) return;

        lock (_lock)
        {
            if (_monitorBridges.TryGetValue(lineId, out var existing)
                && existing.IsRunning
                && string.Equals(_monitorMediaGroupIds.GetValueOrDefault(lineId), mediaGroupId, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
        }

        await StopMonitorAsync(lineId, cancellationToken);

        var bridge = ActivatorUtilities.CreateInstance<RtpOpusBridgeService>(_serviceProvider);
        lock (_lock)
        {
            _monitorBridges[lineId] = bridge;
            _monitorMediaGroupIds[lineId] = mediaGroupId;
        }

        try
        {
            await bridge.StartReceiveOnlyAsync(mediaGroupId, cancellationToken);
            _logger.LogInformation(
                "Line monitor RTP bridge started. lineId={LineId} mediaGroupId={MediaGroupId}",
                lineId,
                mediaGroupId);
        }
        catch
        {
            lock (_lock)
            {
                _monitorBridges.Remove(lineId);
                _monitorMediaGroupIds.Remove(lineId);
            }
            await DisposeBridgeAsync(bridge, cancellationToken);
            throw;
        }
    }

    public async Task SetMonitorTalkAsync(string lineId, bool talk, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(lineId)) return;

        RtpOpusBridgeService? bridge;
        string? mediaGroupId;
        lock (_lock)
        {
            _monitorBridges.TryGetValue(lineId, out bridge);
            mediaGroupId = _monitorMediaGroupIds.GetValueOrDefault(lineId);
        }

        if (bridge == null || string.IsNullOrWhiteSpace(mediaGroupId))
        {
            _logger.LogDebug("SetMonitorTalk ignored — no monitor session for line {LineId}", lineId);
            return;
        }

        // Same media group: the bridge switches uplink on/off in place, keeping
        // the listen downlink running (no audio gap).
        if (talk)
        {
            await bridge.StartAsync(mediaGroupId, cancellationToken);
        }
        else
        {
            await bridge.StartReceiveOnlyAsync(mediaGroupId, cancellationToken);
        }

        _logger.LogInformation("Monitor PTT {State} for line {LineId}", talk ? "ON" : "OFF", lineId);
    }

    public async Task StopMonitorAsync(string lineId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(lineId)) return;

        RtpOpusBridgeService? bridge;
        lock (_lock)
        {
            _monitorBridges.Remove(lineId, out bridge);
            _monitorMediaGroupIds.Remove(lineId);
        }

        await DisposeBridgeAsync(bridge, cancellationToken);
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        RtpOpusBridgeService? bridge;
        lock (_lock)
        {
            bridge = _callBridge;
            _callBridge = null;
            _activeCallMediaGroupId = null;
        }

        await DisposeBridgeAsync(bridge, cancellationToken);
    }

    public async Task StopAllAsync(CancellationToken cancellationToken = default)
    {
        RtpOpusBridgeService? callBridge;
        List<RtpOpusBridgeService> monitors;
        lock (_lock)
        {
            callBridge = _callBridge;
            _callBridge = null;
            _activeCallMediaGroupId = null;
            monitors = _monitorBridges.Values.ToList();
            _monitorBridges.Clear();
            _monitorMediaGroupIds.Clear();
        }

        await DisposeBridgeAsync(callBridge, cancellationToken);
        foreach (var monitor in monitors)
        {
            await DisposeBridgeAsync(monitor, cancellationToken);
        }
    }

    private async Task DisposeBridgeAsync(RtpOpusBridgeService? bridge, CancellationToken cancellationToken)
    {
        if (bridge == null) return;

        try
        {
            await bridge.StopAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed stopping RTP bridge");
        }

        try
        {
            bridge.Dispose();
        }
        catch { }
    }

    public void Dispose()
    {
        try
        {
            StopAllAsync(CancellationToken.None).GetAwaiter().GetResult();
        }
        catch { }
    }
}
