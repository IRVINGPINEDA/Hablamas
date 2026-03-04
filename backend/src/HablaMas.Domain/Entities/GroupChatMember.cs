namespace HablaMas.Domain.Entities;

public class GroupChatMember
{
    public Guid GroupChatId { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;

    public GroupChat GroupChat { get; set; } = default!;
    public AppUser User { get; set; } = default!;
}
