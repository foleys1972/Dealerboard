using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class DirectContactService : IDirectContactService
{
    private readonly ILogger<DirectContactService> _logger;
    private readonly HttpClient _httpClient;
    private readonly IAuthService _authService;

    public DirectContactService(ILogger<DirectContactService> logger, HttpClient httpClient, IAuthService authService)
    {
        _logger = logger;
        _httpClient = httpClient;
        _authService = authService;
    }

    public async Task<IReadOnlyList<DirectContact>> GetDirectContactsAsync(string? ownerId = null)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Direct contacts: no auth token available");
                return Array.Empty<DirectContact>();
            }

            var url = string.IsNullOrWhiteSpace(ownerId) ? "/api/direct-contacts" : $"/api/direct-contacts?ownerId={Uri.EscapeDataString(ownerId)}";
            var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var res = await _httpClient.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch direct contacts: {Status} {Body}", res.StatusCode, body);
                return Array.Empty<DirectContact>();
            }

            var parsed = JsonSerializer.Deserialize<GetDirectContactsResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (parsed?.Contacts == null) return Array.Empty<DirectContact>();
            return parsed.Contacts;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch direct contacts");
            return Array.Empty<DirectContact>();
        }
    }

    public async Task<DirectContact?> AddDirectContactAsync(string contactUserId, string? displayName = null, string? ownerId = null)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Add direct contact: no auth token available");
                return null;
            }

            object payload;
            if (string.IsNullOrWhiteSpace(ownerId))
            {
                // Backend derives owner from auth token. Sending ownerId=null can still violate FK in some DB setups.
                payload = new
                {
                    contactUserId,
                    displayName
                };
            }
            else
            {
                payload = new
                {
                    ownerId,
                    contactUserId,
                    displayName
                };
            }

            var req = new HttpRequestMessage(HttpMethod.Post, "/api/direct-contacts");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            var res = await _httpClient.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to add direct contact: {Status} {Body}", res.StatusCode, body);
                return null;
            }

            var parsed = JsonSerializer.Deserialize<AddDirectContactResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return parsed?.Contact;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to add direct contact");
            return null;
        }
    }

    public async Task<bool> DeleteDirectContactAsync(string contactId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Delete direct contact: no auth token available");
                return false;
            }

            var req = new HttpRequestMessage(HttpMethod.Delete, $"/api/direct-contacts/{Uri.EscapeDataString(contactId)}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var res = await _httpClient.SendAsync(req);
            if (res.IsSuccessStatusCode) return true;

            var body = await res.Content.ReadAsStringAsync();
            _logger.LogWarning("Failed to delete direct contact: {Status} {Body}", res.StatusCode, body);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete direct contact");
            return false;
        }
    }

    private class GetDirectContactsResponse
    {
        public bool Success { get; set; }
        public string? OwnerId { get; set; }
        public List<DirectContact>? Contacts { get; set; }
        public int Count { get; set; }
    }

    private class AddDirectContactResponse
    {
        public bool Success { get; set; }
        public DirectContact? Contact { get; set; }
        public string? Message { get; set; }
    }
}
