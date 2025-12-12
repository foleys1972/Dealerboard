using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface IAuthService
{
    User? CurrentUser { get; }
    string? AuthToken { get; }
    bool IsAuthenticated { get; }
    
    event EventHandler<User>? UserAuthenticated;
    event EventHandler? UserLoggedOut;
    
    Task<bool> LoginAsync(string username, string password);
    Task<bool> LoginWithTokenAsync(string token);
    Task LogoutAsync();
    Task<bool> RefreshTokenAsync();
}

