using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class GroupService : IGroupService
{
    private readonly ILogger<GroupService> _logger;
    private readonly HttpClient _httpClient;
    private readonly IAuthService _authService;

    public GroupService(ILogger<GroupService> logger, HttpClient httpClient, IAuthService authService)
    {
        _logger = logger;
        _httpClient = httpClient;
        _authService = authService;
    }

    public async Task<List<Group>> GetUserGroupsAsync()
    {
        try
        {
            // Ensure auth token is available
            var authToken = _authService.AuthToken;
            int retries = 0;
            while (string.IsNullOrEmpty(authToken) && retries < 5)
            {
                _logger.LogInformation("Waiting for auth token for groups request... (attempt {Attempt})", retries + 1);
                await Task.Delay(100);
                authToken = _authService.AuthToken;
                retries++;
            }

            // Create request with auth header - include userId query param to get user's groups
            var userId = _authService.CurrentUser?.Id ?? _authService.CurrentUser?.Username;
            var requestUri = string.IsNullOrEmpty(userId) ? "/api/groups" : $"/api/groups?userId={Uri.EscapeDataString(userId)}";
            var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
            
            if (!string.IsNullOrEmpty(authToken))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
                _logger.LogInformation("Setting auth token for groups request");
            }
            else
            {
                _logger.LogWarning("No auth token available for groups request after {Retries} attempts", retries);
                return new List<Group>();
            }

            var response = await _httpClient.SendAsync(request);
            
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Failed to fetch groups: {StatusCode}, Response: {Error}", response.StatusCode, errorContent);
                return new List<Group>();
            }

            var content = await response.Content.ReadAsStringAsync();
            _logger.LogInformation("Groups API response: {Content}", content);
            
            // The API might return { groups: [...] } or just an array
            List<GroupDto>? groups = null;
            try
            {
                var groupsResponse = JsonSerializer.Deserialize<GroupsResponse>(content, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                groups = groupsResponse?.Groups;
            }
            catch
            {
                // Try parsing as direct array
                groups = JsonSerializer.Deserialize<List<GroupDto>>(content, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }

            if (groups == null)
            {
                _logger.LogWarning("No groups found in response or deserialization failed.");
                return new List<Group>();
            }

            // Convert to Group models
            var result = groups.Select(g => new Group
            {
                Id = g.Id ?? "",
                Name = g.Name ?? "",
                Description = g.Description,
                CallMode = ParseCallMode(g.CallMode ?? "Hunt"),
                Members = g.Members?.Select(m => new GroupMember
                {
                    UserId = m.UserId ?? "",
                    Username = m.Username ?? "",
                    Priority = m.Priority,
                    IsHost = m.IsHost,
                    IsAvailable = m.IsAvailable
                }).ToList() ?? new List<GroupMember>()
            }).ToList();

            _logger.LogInformation("Successfully fetched {Count} groups.", result.Count);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching groups.");
            return new List<Group>();
        }
    }

    private CallMode ParseCallMode(string callMode)
    {
        return callMode?.ToLower() switch
        {
            "conference" => CallMode.Conference,
            "hunt" => CallMode.Hunt,
            _ => CallMode.Hunt
        };
    }

    private class GroupDto
    {
        public string? Id { get; set; }
        public string? Name { get; set; }
        public string? Description { get; set; }
        public string? CallMode { get; set; }
        public List<GroupMemberDto>? Members { get; set; }
    }

    private class GroupMemberDto
    {
        public string? UserId { get; set; }
        public string? Username { get; set; }
        public int Priority { get; set; }
        public bool IsHost { get; set; }
        public bool IsAvailable { get; set; }
    }

    private class GroupsResponse
    {
        public List<GroupDto>? Groups { get; set; }
    }
}

