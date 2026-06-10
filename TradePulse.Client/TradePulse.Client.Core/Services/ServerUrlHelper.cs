using System.Text.RegularExpressions;

namespace TradePulse.Client.Core.Services;

public static class ServerUrlHelper
{
    private static readonly Regex MissingSlashAfterScheme = new(@"^(https?):/([^/])", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>
    /// Normalizes the server URL for API/Socket.IO connections.
    /// An explicitly configured scheme is trusted as-is; the backend runs TLS
    /// (HTTPS_ENABLED=true) in dev as well as production.
    /// </summary>
    public static string Normalize(string? serverUrl)
    {
        var url = (serverUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            return url;
        }

        // Fix common typos: http:/host -> http://host
        url = MissingSlashAfterScheme.Replace(url, "$1://$2");

        if (!url.Contains("://", StringComparison.Ordinal))
        {
            // Secure by default when only a host[:port] is entered.
            url = $"https://{url}";
        }

        url = url.TrimEnd('/');

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return url;
        }

        // Port 3000 is the React dev UI, not the API.
        if (uri.Port == 3000)
        {
            uri = new UriBuilder(uri) { Port = 5000 }.Uri;
        }

        return uri.ToString().TrimEnd('/');
    }

    public static bool TryNormalize(string? serverUrl, out string normalized, out string errorMessage)
    {
        normalized = Normalize(serverUrl);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            errorMessage = "Please enter a server URL.";
            return false;
        }

        if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri) || string.IsNullOrWhiteSpace(uri.Host))
        {
            errorMessage = "Invalid server URL. Use format https://192.168.1.58:5000 (note the double slash after https:).";
            return false;
        }

        if (uri.Scheme is not ("http" or "https"))
        {
            errorMessage = "Server URL must start with http:// or https://.";
            return false;
        }

        errorMessage = string.Empty;
        return true;
    }
}
