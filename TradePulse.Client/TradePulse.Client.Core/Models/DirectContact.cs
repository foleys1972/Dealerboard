namespace TradePulse.Client.Core.Models;

public class DirectContact
{
    public string Id { get; set; } = string.Empty;
    public string OwnerId { get; set; } = string.Empty;
    public string? ContactUserId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? Uri { get; set; }
    public string? Extension { get; set; }
    public Dictionary<string, object>? Metadata { get; set; }
    public DateTime? CreatedAt { get; set; }
}
