namespace TradePulse.Dealerboard.Client.Models;

public class DealerboardLine
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // "private_wire" or "DDI"
    public string? Mode { get; set; } // "ARD", "MRD", "HOOT" for private wires
    public string? SudoLineReference { get; set; }
    public bool IsActive { get; set; }
}


