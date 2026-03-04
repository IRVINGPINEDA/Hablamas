namespace HablaMas.Domain.Entities;

public class Conversation
{
    public Guid Id { get; set; }
    public Guid UserAId { get; set; }
    public Guid UserBId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastMessageAt { get; set; }

    public AppUser UserA { get; set; } = default!;
    public AppUser UserB { get; set; } = default!;
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
