namespace TradePulse.Client.Core.Models;

public class User
{
    public string Id { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? Email { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string Role { get; set; } = "user";
    public string Status { get; set; } = "offline"; // "online", "offline", "away", "busy"
    public bool IsOnline { get; set; }
    public DateTime? LastSeen { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Extension { get; set; }
    public string? SipUri { get; set; }
    public string? Department { get; set; }
    public string? CompanyName { get; set; }
    public string? Country { get; set; }
    public string? TenantId { get; set; }
    public string? SiteId { get; set; }

    public string? EffectiveSiteId { get; set; }
    public string? HomeSiteId { get; set; }
    public string? RecommendedSubscriberUrl { get; set; }
    public List<string>? FailoverSubscriberUrls { get; set; }
    
    [System.Text.Json.Serialization.JsonPropertyName("matrixHomeserver")]
    public MatrixHomeserver? MatrixHomeserver { get; set; }
    [System.Text.Json.Serialization.JsonPropertyName("intercomEnabled")]
    public bool IntercomEnabled { get; set; } = true;
    
    [System.Text.Json.Serialization.JsonPropertyName("dealerboardEnabled")]
    public bool DealerboardEnabled { get; set; } = false;

    public bool IsOnlineStatus => Status == "online" || IsOnline;
}

public class MatrixHomeserver
{
    public string? Id { get; set; }

    [System.Text.Json.Serialization.JsonPropertyName("baseUrl")]
    public string? BaseUrl { get; set; }

    public string? Region { get; set; }
    public string? ServerName { get; set; }
    public string? FederationUrl { get; set; }
}

