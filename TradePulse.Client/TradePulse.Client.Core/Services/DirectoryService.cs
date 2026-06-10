using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class DirectoryService : IDirectoryService
{
    private readonly ILogger<DirectoryService> _logger;
    private readonly HttpClient _httpClient;
    private readonly IAuthService _authService;

    public DirectoryService(ILogger<DirectoryService> logger, HttpClient httpClient, IAuthService authService)
    {
        _logger = logger;
        _httpClient = httpClient;
        _authService = authService;
    }

    public async Task<IReadOnlyList<User>> GetDirectoryAsync()
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Directory: no auth token available");
                return Array.Empty<User>();
            }

            var req = new HttpRequestMessage(HttpMethod.Get, "/api/auth/directory");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var res = await _httpClient.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch directory: {Status} {Body}", res.StatusCode, body);
                return Array.Empty<User>();
            }

            var parsed = JsonSerializer.Deserialize<DirectoryResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (parsed?.Users == null)
            {
                return Array.Empty<User>();
            }

            // Map minimal fields into User model.
            return parsed.Users.Select(u => new User
            {
                Id = u.Id ?? u.UserId ?? u.Username ?? string.Empty,
                Username = u.Username ?? string.Empty,
                Email = u.Email ?? string.Empty,
                DisplayName = u.DisplayName ?? u.Name ?? u.Username ?? string.Empty,
                FirstName = u.FirstName ?? string.Empty,
                LastName = u.LastName ?? string.Empty,
                Status = u.Status ?? "offline",
                IsOnline = !string.IsNullOrWhiteSpace(u.Status) && !string.Equals(u.Status, "offline", StringComparison.OrdinalIgnoreCase),
                IsActive = u.IsActive,
                Extension = u.Extension,
                SipUri = u.SipUri,
                Department = u.Department,
                TenantId = u.TenantId,
                SiteId = u.SiteId,
                Role = u.Role ?? "user",
                IntercomEnabled = u.IntercomEnabled,
                DealerboardEnabled = u.DealerboardEnabled
            }).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch directory");
            return Array.Empty<User>();
        }
    }

    private class DirectoryResponse
    {
        public bool Success { get; set; }
        public List<UserDto>? Users { get; set; }
        public int Total { get; set; }
    }

    private class UserDto
    {
        public string? Id { get; set; }
        public string? UserId { get; set; }
        public string? Username { get; set; }
        public string? Email { get; set; }
        public string? Name { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? DisplayName { get; set; }
        public string? Role { get; set; }
        public bool IsActive { get; set; }
        public string? Extension { get; set; }
        public string? SipUri { get; set; }
        public string? Department { get; set; }
        public string? TenantId { get; set; }
        public string? SiteId { get; set; }
        public string? Status { get; set; }
        public bool IntercomEnabled { get; set; }
        public bool DealerboardEnabled { get; set; }
    }
}
