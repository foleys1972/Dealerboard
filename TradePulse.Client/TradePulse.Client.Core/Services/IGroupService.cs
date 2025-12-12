using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface IGroupService
{
    Task<List<Group>> GetUserGroupsAsync();
}

