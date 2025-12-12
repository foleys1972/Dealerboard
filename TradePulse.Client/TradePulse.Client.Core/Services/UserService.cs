using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class UserService : IUserService
{
    private readonly ILogger<UserService> _logger;
    private readonly HttpClient _httpClient;
    private readonly IAuthService _authService;

    public UserService(ILogger<UserService> logger, HttpClient httpClient, IAuthService authService)
    {
        _logger = logger;
        _httpClient = httpClient;
        _authService = authService;
    }

    public async Task<List<User>> GetContactsAsync()
    {
        try
        {
            // Ensure auth token is set - retry a few times if not available yet
            var authToken = _authService.AuthToken;
            int retries = 0;
            while (string.IsNullOrEmpty(authToken) && retries < 5)
            {
                _logger.LogInformation("Waiting for auth token... (attempt {Attempt})", retries + 1);
                await Task.Delay(100);
                authToken = _authService.AuthToken;
                retries++;
            }
            
            // Create request with auth header
            var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/users");
            
            if (!string.IsNullOrEmpty(authToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
                _logger.LogInformation("Setting auth token for contacts request (token length: {TokenLength})", authToken.Length);
            }
            else
            {
                _logger.LogWarning("No auth token available for contacts request after {Retries} attempts", retries);
                return new List<User>();
            }

            // Ensure HttpClient has the correct base address
            if (_httpClient.BaseAddress == null)
            {
                // Try to get base address from AuthService if possible
                _logger.LogWarning("HttpClient base address is null, attempting to set it");
            }

            var response = await _httpClient.SendAsync(request);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Failed to fetch contacts: {StatusCode}, Response: {Error}", response.StatusCode, errorContent);
                _logger.LogWarning("Auth token present: {HasToken}, Token length: {TokenLength}", !string.IsNullOrEmpty(authToken), authToken?.Length ?? 0);
                return new List<User>();
            }

            var content = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<UsersResponse>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result?.Users == null)
            {
                return new List<User>();
            }

            // Convert to User models
            var users = result.Users.Select(u => new User
            {
                Id = u.Id ?? u.UserId ?? u.Username ?? "",
                Username = u.Username ?? "",
                Email = u.Email ?? "",
                DisplayName = u.DisplayName ?? u.Name ?? u.Username ?? "",
                FirstName = u.FirstName ?? "",
                LastName = u.LastName ?? "",
                Status = u.Status ?? "offline",
                IsActive = u.IsActive,
                Extension = u.Extension,
                Department = u.Department,
                Role = u.Role ?? "user",
                IntercomEnabled = u.IntercomEnabled,
                DealerboardEnabled = u.DealerboardEnabled
            }).ToList();

            _logger.LogInformation("Loaded {Count} contacts", users.Count);
            return users;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch contacts");
            return new List<User>();
        }
    }

    public async Task<User?> GetUserAsync(string userId)
    {
        try
        {
            // Create request with auth header
            var request = new HttpRequestMessage(HttpMethod.Get, $"/api/auth/users/{userId}");
            
            // Ensure auth token is set
            var authToken = _authService.AuthToken;
            if (!string.IsNullOrEmpty(authToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
            }

            var response = await _httpClient.SendAsync(request);
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch user {UserId}: {StatusCode}", userId, response.StatusCode);
                return null;
            }

            var content = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<UserResponse>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result?.User == null)
            {
                return null;
            }

            var u = result.User;
            return new User
            {
                Id = u.Id ?? u.Username ?? "",
                Username = u.Username ?? "",
                Email = u.Email ?? "",
                DisplayName = u.DisplayName ?? u.Name ?? u.Username ?? "",
                FirstName = u.FirstName ?? "",
                LastName = u.LastName ?? "",
                Status = u.Status ?? "offline",
                IsOnline = (u.Status ?? "offline") == "online",
                IsActive = u.IsActive,
                Extension = u.Extension,
                Department = u.Department,
                Role = u.Role ?? "user",
                IntercomEnabled = u.IntercomEnabled,
                DealerboardEnabled = u.DealerboardEnabled
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch user {UserId}", userId);
            return null;
        }
    }

    private class UsersResponse
    {
        public bool Success { get; set; }
        public List<UserDto>? Users { get; set; }
        public int Total { get; set; }
    }

    private class UserResponse
    {
        public bool Success { get; set; }
        public UserDto? User { get; set; }
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
        public string? Department { get; set; }
        public string? Status { get; set; }
        public bool IntercomEnabled { get; set; }
        public bool DealerboardEnabled { get; set; }
    }
}

