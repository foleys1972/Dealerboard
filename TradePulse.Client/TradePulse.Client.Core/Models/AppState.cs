namespace TradePulse.Client.Core.Models;

public class AppState
{
    public User? CurrentUser { get; set; }
    public string? AuthToken { get; set; }
    public bool IsAuthenticated => CurrentUser != null && !string.IsNullOrEmpty(AuthToken);
    public bool IsConnected { get; set; }
    public Call? CurrentCall { get; set; }
    public List<Favorite> Favorites { get; set; } = new();
    public List<IptvStream> ActiveStreams { get; set; } = new();
    public bool DoNotDisturb { get; set; }
    public string? CallForwardTo { get; set; }
}

