using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using TradePulse.Client.Core.Services;
using TradePulse.Dealerboard.Client.Models;

namespace TradePulse.Dealerboard.Client.Services;

public class DealerboardService : IDealerboardService
{
    private readonly ILogger<DealerboardService> _logger;
    private readonly HttpClient _httpClient;
    private readonly IAuthService _authService;
    private readonly IConfigurationService _configService;

    public DealerboardService(
        ILogger<DealerboardService> logger,
        HttpClient httpClient,
        IAuthService authService,
        IConfigurationService configService)
    {
        _logger = logger;
        _httpClient = httpClient;
        _authService = authService;
        _configService = configService;
    }

    private Uri BuildApiUri(string path)
    {
        var baseUrl = ServerUrlHelper.Normalize(
            !string.IsNullOrWhiteSpace(_configService.ServerUrl)
                ? _configService.ServerUrl
                : _authService.GetActiveServerUrl());
        if (string.IsNullOrWhiteSpace(baseUrl) || !Uri.TryCreate(baseUrl, UriKind.Absolute, out _))
        {
            throw new InvalidOperationException($"Invalid server URL: {baseUrl}");
        }

        var normalizedPath = path.StartsWith('/') ? path : $"/{path}";
        return new Uri($"{baseUrl.TrimEnd('/')}{normalizedPath}");
    }

    private async Task<HttpResponseMessage> SendAuthorizedAsync(HttpMethod method, string path, HttpContent? content = null)
    {
        var token = _authService.AuthToken;
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("No auth token available");
        }

        var req = new HttpRequestMessage(method, BuildApiUri(path)) { Content = content };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await _httpClient.SendAsync(req);
    }

    private sealed class NotificationsResponse
    {
        public List<DealerboardNotification>? Notifications { get; set; }
    }

    public async Task<List<DealerboardNotification>> GetNotificationsAsync(int limit = 50)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Notifications: no auth token available");
                return new List<DealerboardNotification>();
            }

            if (limit <= 0) limit = 50;
            if (limit > 200) limit = 200;

            var res = await SendAuthorizedAsync(HttpMethod.Get, $"/api/notifications?limit={limit}");
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch notifications: {Status} {Body}", res.StatusCode, body);
                return new List<DealerboardNotification>();
            }

            var parsed = JsonSerializer.Deserialize<NotificationsResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return parsed?.Notifications ?? new List<DealerboardNotification>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get notifications");
            return new List<DealerboardNotification>();
        }
    }

    public async Task DeleteNotificationAsync(string notificationId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            if (string.IsNullOrWhiteSpace(notificationId))
            {
                return;
            }

            var res = await SendAuthorizedAsync(HttpMethod.Delete, $"/api/notifications/{Uri.EscapeDataString(notificationId)}");
            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to delete notification: {Status} {Body}", res.StatusCode, body);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete notification");
        }
    }

    public async Task<DealerboardConfig> GetConfigAsync(string userId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Dealerboard config: no auth token available");
                return new DealerboardConfig();
            }

            var configPath = $"/api/dealerboard/config/{userId}";
            _logger.LogInformation("Fetching dealerboard config from {Url}", BuildApiUri(configPath));
            var res = await SendAuthorizedAsync(HttpMethod.Get, configPath);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch dealerboard config: {Status} {Body}", res.StatusCode, body);
                return new DealerboardConfig();
            }

            var parsed = JsonSerializer.Deserialize<DealerboardConfigResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (parsed?.Success != true)
            {
                return new DealerboardConfig();
            }

            // Convert nested dictionaries
            var config = new DealerboardConfig();
            if (parsed.Assignments != null)
            {
                foreach (var pageKvp in parsed.Assignments)
                {
                    if (string.Equals(pageKvp.Key, "broadcasts", StringComparison.OrdinalIgnoreCase))
                    {
                        config.Intercom.Broadcasts = ParseIntercomSection(pageKvp.Value);
                        continue;
                    }
                    if (string.Equals(pageKvp.Key, "groups", StringComparison.OrdinalIgnoreCase))
                    {
                        config.Intercom.Groups = ParseIntercomSection(pageKvp.Value);
                        continue;
                    }
                    if (string.Equals(pageKvp.Key, "contacts", StringComparison.OrdinalIgnoreCase))
                    {
                        config.Intercom.Contacts = ParseIntercomSection(pageKvp.Value);
                        continue;
                    }

                    if (!int.TryParse(pageKvp.Key, out var pageNum))
                    {
                        continue;
                    }

                    config.Assignments[pageNum] = new Dictionary<int, ButtonAssignment>();
                    
                    foreach (var buttonKvp in pageKvp.Value)
                    {
                        if (!int.TryParse(buttonKvp.Key, out var buttonNum))
                        {
                            continue;
                        }
                        config.Assignments[pageNum][buttonNum] = MapButtonAssignment(buttonKvp.Value);
                    }
                }
            }

            if (parsed.Preferences != null)
            {
                config.Preferences = new DealerboardPreferences
                {
                    AudibleRinging = parsed.Preferences.AudibleRinging,
                    ButtonColors = parsed.Preferences.ButtonColors ?? new Dictionary<string, object>(),
                    Preferences = parsed.Preferences.Preferences ?? new Dictionary<string, object>(),
                    DefaultDdiLineId = parsed.Preferences.DefaultDdiLineId
                };
            }

            return config;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get dealerboard config");
            return new DealerboardConfig();
        }
    }

    public async Task<List<BroadcastGroup>> GetRegularGroupsAsync()
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                return new List<BroadcastGroup>();
            }

            var res = await SendAuthorizedAsync(HttpMethod.Get, "/api/groups");
            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                return new List<BroadcastGroup>();
            }

            var parsed = JsonSerializer.Deserialize<GroupsResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return (parsed?.Groups ?? new List<BroadcastGroup>())
                .Where(g => !string.Equals(g.CallMode, "broadcast", StringComparison.OrdinalIgnoreCase))
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get regular groups");
            return new List<BroadcastGroup>();
        }
    }

    public async Task<List<BroadcastGroup>> GetBroadcastsAsync()
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Broadcasts: no auth token available");
                return new List<BroadcastGroup>();
            }

            var res = await SendAuthorizedAsync(HttpMethod.Get, "/api/groups?callMode=broadcast");
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch broadcasts: {Status} {Body}", res.StatusCode, body);
                return new List<BroadcastGroup>();
            }

            var parsed = JsonSerializer.Deserialize<GroupsResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return parsed?.Groups ?? new List<BroadcastGroup>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get broadcasts");
            return new List<BroadcastGroup>();
        }
    }

    public async Task<List<DealerboardLine>> GetAvailableLinesAsync()
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Available lines: no auth token available");
                return new List<DealerboardLine>();
            }

            var res = await SendAuthorizedAsync(HttpMethod.Get, "/api/dealerboard/lines");
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch available lines: {Status} {Body}", res.StatusCode, body);
                return new List<DealerboardLine>();
            }

            var parsed = JsonSerializer.Deserialize<LinesResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return parsed?.Lines ?? new List<DealerboardLine>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get available lines");
            return new List<DealerboardLine>();
        }
    }

    public async Task<List<SpeedDial>> GetSpeedDialsAsync(string userId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                _logger.LogWarning("Speed dials: no auth token available");
                return new List<SpeedDial>();
            }

            var res = await SendAuthorizedAsync(HttpMethod.Get, $"/api/dealerboard/speed-dials?userId={Uri.EscapeDataString(userId)}");
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch speed dials: {Status} {Body}", res.StatusCode, body);
                return new List<SpeedDial>();
            }

            var parsed = JsonSerializer.Deserialize<SpeedDialsResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return parsed?.SpeedDials ?? new List<SpeedDial>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get speed dials");
            return new List<SpeedDial>();
        }
    }

    public async Task<LineCallResult> CallPrivateWireAsync(string lineId, bool autoRing = false, bool hoot = false)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var payload = new { autoRing, hoot };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var res = await SendAuthorizedAsync(
                HttpMethod.Post,
                $"/api/dealerboard/private-wires/{lineId}/call",
                content);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Call failed: {res.StatusCode} {body}");
            }

            return ParseLineCallResult(body);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to call private wire");
            throw;
        }
    }

    public async Task SignalPrivateWireAsync(string lineId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var res = await SendAuthorizedAsync(HttpMethod.Post, $"/api/dealerboard/private-wires/{lineId}/signal");
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Signal failed: {res.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to signal private wire");
            throw;
        }
    }

    public async Task<LineCallResult> CallDdiLineAsync(string lineId, string? digits = null)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var payload = new { digits };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var res = await SendAuthorizedAsync(
                HttpMethod.Post,
                $"/api/dealerboard/lines/{lineId}/call",
                content);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Call failed: {res.StatusCode} {body}");
            }

            return ParseLineCallResult(body);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to call DDI line");
            throw;
        }
    }

    public async Task CallSpeedDialAsync(string speedDialId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var res = await SendAuthorizedAsync(HttpMethod.Post, $"/api/dealerboard/speed-dial/{speedDialId}/call");
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Speed dial call failed: {res.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to call speed dial");
            throw;
        }
    }

    public async Task<MonitorLineResult> MonitorPrivateWireAsync(string lineId, bool enabled)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var payload = new { enabled };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var res = await SendAuthorizedAsync(
                HttpMethod.Post,
                $"/api/dealerboard/private-wires/{lineId}/monitor",
                content);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Monitor failed: {res.StatusCode} {body}");
            }

            return JsonSerializer.Deserialize<MonitorLineResult>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new MonitorLineResult { Success = true };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to toggle monitor");
            throw;
        }
    }

    public async Task<LineCallResult> AnswerIncomingLineAsync(string lineId, string? sipCallId = null)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var payload = new { sipCallId };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var res = await SendAuthorizedAsync(
                HttpMethod.Post,
                $"/api/dealerboard/private-wires/{lineId}/answer",
                content);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Answer failed: {res.StatusCode} {body}");
            }

            return ParseLineCallResult(body);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to answer incoming line");
            throw;
        }
    }

    public async Task SaveMonitoredLineIdsAsync(string userId, List<string> monitoredLineIds)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            if (string.IsNullOrWhiteSpace(userId))
            {
                throw new Exception("Missing userId");
            }

            // Persist in dealerboard_user_preferences.preferences.monitoredLineIds
            var payload = new
            {
                preferences = new
                {
                    monitoredLineIds = monitoredLineIds ?? new List<string>()
                }
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var res = await SendAuthorizedAsync(
                HttpMethod.Put,
                $"/api/dealerboard/preferences/{Uri.EscapeDataString(userId)}",
                content);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Save preferences failed: {res.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist monitoredLineIds");
            // Non-fatal: monitoring can still work locally.
        }
    }

    public async Task EndCallAsync(string lineId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            // Use the generic endpoint so it works for both private wires and DDI lines.
            var res = await SendAuthorizedAsync(HttpMethod.Post, $"/api/dealerboard/lines/{lineId}/end");
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"End call failed: {res.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to end call");
            throw;
        }
    }

    public async Task SendDtmfAsync(string lineId, string digit)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var payload = new { digit };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var res = await SendAuthorizedAsync(
                HttpMethod.Post,
                $"/api/dealerboard/lines/{lineId}/dtmf",
                content);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"DTMF failed: {res.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send DTMF");
            throw;
        }
    }

    public async Task SignalLineAsync(string lineId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var res = await SendAuthorizedAsync(HttpMethod.Post, $"/api/dealerboard/lines/{lineId}/signal");
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception($"Signal failed: {res.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to signal line");
            throw;
        }
    }

    public async Task TransferLineCallAsync(string sourceLineId, string? targetLineId = null, string? digits = null)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var payload = new { targetLineId, digits };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var res = await SendAuthorizedAsync(
                HttpMethod.Post,
                $"/api/dealerboard/lines/{sourceLineId}/transfer",
                content);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception(ParseApiError(body) ?? $"Transfer failed: {res.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to transfer line call");
            throw;
        }
    }

    public async Task ConferenceLineCallAsync(string sourceLineId, string targetLineId)
    {
        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                throw new Exception("No auth token available");
            }

            var payload = new { targetLineId };
            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var res = await SendAuthorizedAsync(
                HttpMethod.Post,
                $"/api/dealerboard/lines/{sourceLineId}/conference",
                content);
            var body = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                throw new Exception(ParseApiError(body) ?? $"Conference failed: {res.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to conference line calls");
            throw;
        }
    }

    private static string? ParseApiError(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var errorProp))
            {
                return errorProp.GetString();
            }
        }
        catch
        {
            // ignore parse failures
        }

        return null;
    }

    private static Dictionary<int, ButtonAssignment> ParseIntercomSection(Dictionary<string, ButtonAssignmentDto> section)
    {
        var result = new Dictionary<int, ButtonAssignment>();
        foreach (var buttonKvp in section)
        {
            if (!int.TryParse(buttonKvp.Key, out var buttonNum))
            {
                continue;
            }
            result[buttonNum] = MapButtonAssignment(buttonKvp.Value);
        }
        return result;
    }

    private static ButtonAssignment MapButtonAssignment(ButtonAssignmentDto dto)
    {
        return new ButtonAssignment
        {
            Id = dto.Id ?? string.Empty,
            AssignmentType = dto.AssignmentType ?? string.Empty,
            LineId = dto.LineId,
            DdiLineId = dto.DdiLineId,
            SpeedDialId = dto.SpeedDialId,
            BroadcastId = dto.BroadcastId,
            GroupId = dto.GroupId,
            ContactUserId = dto.ContactId ?? dto.UserId ?? dto.ContactUserId,
            Metadata = dto.Metadata
        };
    }

    // Response models
    private class DealerboardConfigResponse
    {
        public bool Success { get; set; }
        public Dictionary<string, Dictionary<string, ButtonAssignmentDto>>? Assignments { get; set; }
        public DealerboardPreferencesDto? Preferences { get; set; }
    }

    private class ButtonAssignmentDto
    {
        public string? Id { get; set; }
        public string? AssignmentType { get; set; }
        public string? LineId { get; set; }
        public string? DdiLineId { get; set; }
        public string? SpeedDialId { get; set; }
        public string? BroadcastId { get; set; }
        public string? GroupId { get; set; }
        public string? ContactId { get; set; }
        public string? UserId { get; set; }
        public string? ContactUserId { get; set; }
        public JsonElement Metadata { get; set; }
    }

    private class DealerboardPreferencesDto
    {
        public bool AudibleRinging { get; set; }
        public Dictionary<string, object>? ButtonColors { get; set; }
        public Dictionary<string, object>? Preferences { get; set; }
        public string? DefaultDdiLineId { get; set; }
    }

    private class LinesResponse
    {
        public bool Success { get; set; }
        public List<DealerboardLine>? Lines { get; set; }
    }

    private sealed class BusyStatusResponse
    {
        public bool Success { get; set; }
        public List<string>? PrivateLines { get; set; }
        public List<string>? BusyLines { get; set; }
        public List<string>? RingingLines { get; set; }
        public List<string>? DisconnectedLines { get; set; }
        public List<BusyButtonDto>? PrivateButtons { get; set; }
        public List<BusyButtonDto>? BusyButtons { get; set; }
        public List<BusyButtonDto>? RingingButtons { get; set; }
        public List<BusyButtonDto>? DisconnectedButtons { get; set; }
    }

    private sealed class BusyButtonDto
    {
        public int PageNumber { get; set; }
        public int ButtonNumber { get; set; }
    }

    public async Task<LineButtonStatus> GetLineButtonStatusAsync(string userId)
    {
        var status = new LineButtonStatus();

        try
        {
            var token = _authService.AuthToken;
            if (string.IsNullOrWhiteSpace(token))
            {
                return status;
            }

            var res = await SendAuthorizedAsync(HttpMethod.Get, $"/api/dealerboard/lines/busy-status?userId={Uri.EscapeDataString(userId)}");
            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
            {
                return status;
            }

            var parsed = JsonSerializer.Deserialize<BusyStatusResponse>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (parsed?.Success != true) return status;

            foreach (var id in parsed.PrivateLines ?? new List<string>())
            {
                if (!string.IsNullOrWhiteSpace(id)) status.PrivateLineIds.Add(id);
            }

            foreach (var id in parsed.BusyLines ?? new List<string>())
            {
                if (!string.IsNullOrWhiteSpace(id)) status.BusyLineIds.Add(id);
            }

            foreach (var id in parsed.DisconnectedLines ?? new List<string>())
            {
                if (!string.IsNullOrWhiteSpace(id)) status.DisconnectedLineIds.Add(id);
            }

            foreach (var id in parsed.RingingLines ?? new List<string>())
            {
                if (!string.IsNullOrWhiteSpace(id)) status.RingingLineIds.Add(id);
            }

            foreach (var b in parsed.RingingButtons ?? new List<BusyButtonDto>())
            {
                status.RingingKeys.Add($"{b.PageNumber}-{b.ButtonNumber}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Line button status poll failed");
        }

        return status;
    }

    private class SpeedDialsResponse
    {
        public bool Success { get; set; }
        public List<SpeedDial>? SpeedDials { get; set; }
    }

    private class GroupsResponse
    {
        public bool Success { get; set; }
        public List<BroadcastGroup>? Groups { get; set; }
        public int Count { get; set; }
    }

    private static LineCallResult ParseLineCallResult(string body)
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<LineCallResult>(body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            return parsed ?? new LineCallResult { Success = true };
        }
        catch
        {
            return new LineCallResult { Success = true, Message = body };
        }
    }
}


