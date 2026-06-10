using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface IUserIntercomService
{
    /// <summary>
    /// Load intercom button slots from GET /api/dealerboard/config/:userId (page 0 assignments).
    /// </summary>
    Task<IntercomButtonLayout> GetIntercomButtonLayoutAsync(string? userId = null);

    Task<List<IntercomBroadcastLineSlot>> GetBroadcastLineSlotsAsync();
    Task<IntercomUserConfig?> GetUserIntercomConfigAsync();
    Task<bool> UpdateBroadcastLineSlotsAsync(List<IntercomBroadcastLineSlot> slots);
}
