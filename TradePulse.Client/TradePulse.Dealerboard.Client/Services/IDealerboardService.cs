using System.Collections.Generic;
using System.Threading.Tasks;
using TradePulse.Dealerboard.Client.Models;

namespace TradePulse.Dealerboard.Client.Services;

public interface IDealerboardService
{
    Task<DealerboardConfig> GetConfigAsync(string userId);
    Task<List<DealerboardLine>> GetAvailableLinesAsync();
    Task<LineButtonStatus> GetLineButtonStatusAsync(string userId);
    Task<List<SpeedDial>> GetSpeedDialsAsync(string userId);
    Task<List<BroadcastGroup>> GetBroadcastsAsync();
    Task<List<BroadcastGroup>> GetRegularGroupsAsync();
    Task<List<DealerboardNotification>> GetNotificationsAsync(int limit = 50);
    Task DeleteNotificationAsync(string notificationId);
    Task<LineCallResult> CallPrivateWireAsync(string lineId, bool autoRing = false, bool hoot = false);
    Task SignalPrivateWireAsync(string lineId);
    Task<LineCallResult> CallDdiLineAsync(string lineId, string? digits = null);
    Task CallSpeedDialAsync(string speedDialId);
    Task<MonitorLineResult> MonitorPrivateWireAsync(string lineId, bool enabled);
    Task<LineCallResult> AnswerIncomingLineAsync(string lineId, string? sipCallId = null);
    Task SaveMonitoredLineIdsAsync(string userId, List<string> monitoredLineIds);
    Task EndCallAsync(string lineId);
    Task SendDtmfAsync(string lineId, string digit);
    Task SignalLineAsync(string lineId);
    Task TransferLineCallAsync(string sourceLineId, string? targetLineId = null, string? digits = null);
    Task ConferenceLineCallAsync(string sourceLineId, string targetLineId);
}


