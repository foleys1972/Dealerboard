using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public interface IDirectContactService
{
    Task<IReadOnlyList<DirectContact>> GetDirectContactsAsync(string? ownerId = null);
    Task<DirectContact?> AddDirectContactAsync(string contactUserId, string? displayName = null, string? ownerId = null);
    Task<bool> DeleteDirectContactAsync(string contactId);
}
