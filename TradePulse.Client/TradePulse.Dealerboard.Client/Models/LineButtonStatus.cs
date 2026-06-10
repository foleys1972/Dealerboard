using System.Collections.Generic;

namespace TradePulse.Dealerboard.Client.Models;

/// <summary>
/// Dealerboard line button states: private, busy, ringing, and SIP connectivity.
/// </summary>
public sealed class LineButtonStatus
{
    public HashSet<string> PrivateLineIds { get; init; } = new(System.StringComparer.OrdinalIgnoreCase);
    public HashSet<string> BusyLineIds { get; init; } = new(System.StringComparer.OrdinalIgnoreCase);
    public HashSet<string> DisconnectedLineIds { get; init; } = new(System.StringComparer.OrdinalIgnoreCase);
    public HashSet<string> RingingKeys { get; init; } = new(System.StringComparer.OrdinalIgnoreCase);
    public HashSet<string> RingingLineIds { get; init; } = new(System.StringComparer.OrdinalIgnoreCase);
}
