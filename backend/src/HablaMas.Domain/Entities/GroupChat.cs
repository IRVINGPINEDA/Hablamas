namespace HablaMas.Domain.Entities;

public class GroupChat
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid OwnerUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastMessageAt { get; set; }

    public AppUser OwnerUser { get; set; } = default!;
    public ICollection<GroupChatMember> Members { get; set; } = new List<GroupChatMember>();
    public ICollection<GroupChatMessage> Messages { get; set; } = new List<GroupChatMessage>();
}
