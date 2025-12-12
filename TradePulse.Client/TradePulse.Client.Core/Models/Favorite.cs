namespace TradePulse.Client.Core.Models;

public enum FavoriteType
{
    Contact,
    Group,
    Stream
}

public class Favorite
{
    public string Id { get; set; } = string.Empty;
    public FavoriteType Type { get; set; }
    public string TargetId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Nickname { get; set; }
    public int Order { get; set; }
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

