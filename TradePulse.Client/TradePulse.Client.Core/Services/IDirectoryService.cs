using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface IDirectoryService
{
    Task<IReadOnlyList<User>> GetDirectoryAsync();
}
