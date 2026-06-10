using System;
using System.Collections.Generic;

namespace TradePulse.Dealerboard.Client.Models;

public class DealerboardNotification
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string? Message { get; set; }
    public Dictionary<string, object> Metadata { get; set; } = new();
    public DateTimeOffset? CreatedAt { get; set; }
}
