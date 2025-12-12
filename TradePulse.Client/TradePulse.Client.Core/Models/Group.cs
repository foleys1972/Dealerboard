namespace TradePulse.Client.Core.Models;

public enum CallMode
{
    Hunt,        // First to answer gets 1-to-1 call
    Conference   // All who answer join conference
}

public class Group
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public CallMode CallMode { get; set; } = CallMode.Hunt;
    
    public string CallModeDisplay => CallMode == CallMode.Hunt ? "Hunt" : "Conference";
    public List<GroupMember> Members { get; set; } = new();
    public int AvailableMembers { get; set; }
    public int TotalMembers => Members.Count;
}

public class GroupMember
{
    public string UserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public int Priority { get; set; }
    public bool IsHost { get; set; }
    public bool IsAvailable { get; set; }
}

