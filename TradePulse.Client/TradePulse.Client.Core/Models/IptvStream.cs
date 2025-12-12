namespace TradePulse.Client.Core.Models;

public class IptvStream
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string MulticastAddress { get; set; } = string.Empty;
    public int Port { get; set; }
    public string Codec { get; set; } = "G.722";
    public bool IsSubscribed { get; set; }
    public double Volume { get; set; } = 1.0;
    public int Listeners { get; set; }
}

