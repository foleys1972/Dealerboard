using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Models;

namespace TradePulse.Client.Core.Services;

public class UserIntercomService : IUserIntercomService
{
    private readonly ILogger<UserIntercomService> _logger;
    private readonly HttpClient _httpClient;
    private readonly IAuthService _authService;

    public UserIntercomService(ILogger<UserIntercomService> logger, HttpClient httpClient, IAuthService authService)
    {
        _logger = logger;
        _httpClient = httpClient;
        _authService = authService;
    }

    public async Task<IntercomButtonLayout> GetIntercomButtonLayoutAsync(string? userId = null)
    {
        var layout = new IntercomButtonLayout();
        try
        {
            var authToken = _authService.AuthToken;
            var resolvedUserId = userId ?? _authService.CurrentUser?.Id;
            if (string.IsNullOrEmpty(authToken) || string.IsNullOrWhiteSpace(resolvedUserId))
            {
                return layout;
            }

            var request = new HttpRequestMessage(HttpMethod.Get, $"/api/dealerboard/config/{Uri.EscapeDataString(resolvedUserId)}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);

            var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Failed to fetch intercom button layout: {StatusCode} {Error}", response.StatusCode, error);
                return layout;
            }

            var content = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(content);
            if (!doc.RootElement.TryGetProperty("assignments", out var assignmentsEl) ||
                assignmentsEl.ValueKind != JsonValueKind.Object)
            {
                return layout;
            }

            layout.BroadcastSlots = ParseBroadcastSlots(assignmentsEl);
            layout.GroupCallSlots = ParseGroupCallSlots(assignmentsEl);
            layout.ContactSlots = ParseContactSlots(assignmentsEl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch intercom button layout");
        }

        return layout;
    }

    private static List<IntercomBroadcastLineSlot> ParseBroadcastSlots(JsonElement assignmentsEl)
    {
        var slots = new List<IntercomBroadcastLineSlot>();
        for (var i = 1; i <= 8; i++)
        {
            var groupId = TryGetAssignmentGroupId(assignmentsEl, "broadcasts", i, "broadcastId");
            slots.Add(new IntercomBroadcastLineSlot { Index = i, GroupId = groupId });
        }
        return slots;
    }

    private static List<IntercomGroupCallSlot> ParseGroupCallSlots(JsonElement assignmentsEl)
    {
        var slots = new List<IntercomGroupCallSlot>();
        for (var i = 1; i <= 10; i++)
        {
            var groupId = TryGetAssignmentGroupId(assignmentsEl, "groups", i, "groupId");
            slots.Add(new IntercomGroupCallSlot { Index = i, GroupId = groupId });
        }
        return slots;
    }

    private static List<IntercomContactSlot> ParseContactSlots(JsonElement assignmentsEl)
    {
        var slots = new List<IntercomContactSlot>();
        for (var i = 1; i <= 16; i++)
        {
            var contactUserId = TryGetAssignmentContactId(assignmentsEl, "contacts", i);
            slots.Add(new IntercomContactSlot { Index = i, ContactUserId = contactUserId });
        }
        return slots;
    }

    private static string? TryGetAssignmentGroupId(JsonElement assignmentsEl, string sectionKey, int buttonIndex, string idProperty)
    {
        if (!assignmentsEl.TryGetProperty(sectionKey, out var section) || section.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var key = buttonIndex.ToString();
        if (!section.TryGetProperty(key, out var assignment) || assignment.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (assignment.TryGetProperty(idProperty, out var idProp))
        {
            var id = idProp.GetString();
            if (!string.IsNullOrWhiteSpace(id)) return id;
        }

        if (assignment.TryGetProperty("lineId", out var lineIdProp))
        {
            var id = lineIdProp.GetString();
            if (!string.IsNullOrWhiteSpace(id)) return id;
        }

        return null;
    }

    private static string? TryGetAssignmentContactId(JsonElement assignmentsEl, string sectionKey, int buttonIndex)
    {
        if (!assignmentsEl.TryGetProperty(sectionKey, out var section) || section.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var key = buttonIndex.ToString();
        if (!section.TryGetProperty(key, out var assignment) || assignment.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var prop in new[] { "contactId", "userId", "contactUserId" })
        {
            if (assignment.TryGetProperty(prop, out var idProp))
            {
                var id = idProp.GetString();
                if (!string.IsNullOrWhiteSpace(id)) return id;
            }
        }

        return null;
    }

    public async Task<List<IntercomBroadcastLineSlot>> GetBroadcastLineSlotsAsync()
    {
        var layout = await GetIntercomButtonLayoutAsync();
        return layout.BroadcastSlots;
    }

    public async Task<IntercomUserConfig?> GetUserIntercomConfigAsync()
    {
        try
        {
            var authToken = _authService.AuthToken;
            int retries = 0;
            while (string.IsNullOrEmpty(authToken) && retries < 5)
            {
                await Task.Delay(100);
                authToken = _authService.AuthToken;
                retries++;
            }

            if (string.IsNullOrEmpty(authToken))
            {
                return null;
            }

            // Slot assignments come from dealerboard page-0 (admin Configure Buttons).
            var layout = await GetIntercomButtonLayoutAsync();

            var request = new HttpRequestMessage(HttpMethod.Get, "/api/user-intercom/config");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);

            var response = await _httpClient.SendAsync(request);
            IntercomUserConfig config;
            if (!response.IsSuccessStatusCode)
            {
                config = new IntercomUserConfig();
            }
            else
            {
                var content = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<ConfigResponseDto>(content, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                config = new IntercomUserConfig
                {
                    IntercomEnabled = result?.IntercomEnabled ?? true,
                    AllowedBroadcastGroups = result?.AllowedBroadcastGroups ?? new List<IntercomAllowedGroup>(),
                };
            }

            config.BroadcastSlots = layout.BroadcastSlots;
            config.GroupCallSlots = layout.GroupCallSlots;
            return config;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch user intercom config");
            return null;
        }
    }

    private class ResponseDto
    {
        public bool Success { get; set; }
        public List<IntercomBroadcastLineSlot>? Slots { get; set; }
    }

    private class ConfigResponseDto
    {
        public bool Success { get; set; }
        public bool? IntercomEnabled { get; set; }
        public List<IntercomAllowedGroup>? AllowedBroadcastGroups { get; set; }
        public List<IntercomBroadcastLineSlot>? BroadcastSlots { get; set; }
        public List<IntercomGroupCallSlot>? GroupCallSlots { get; set; }
    }

    public async Task<bool> UpdateBroadcastLineSlotsAsync(List<IntercomBroadcastLineSlot> slots)
    {
        try
        {
            var authToken = _authService.AuthToken;
            int retries = 0;
            while (string.IsNullOrEmpty(authToken) && retries < 5)
            {
                await Task.Delay(100);
                authToken = _authService.AuthToken;
                retries++;
            }

            if (string.IsNullOrEmpty(authToken))
            {
                return false;
            }

            var request = new HttpRequestMessage(HttpMethod.Put, "/api/user-intercom/broadcast-lines");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);

            var body = JsonSerializer.Serialize(
                new { slots = slots ?? new List<IntercomBroadcastLineSlot>() },
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            request.Content = new StringContent(body);
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

            var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Failed to update broadcast line slots: {StatusCode} {Error}", response.StatusCode, error);
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update broadcast line slots");
            return false;
        }
    }
}
