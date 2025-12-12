using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface IUserService
{
    Task<List<User>> GetContactsAsync();
    Task<User?> GetUserAsync(string userId);
}

