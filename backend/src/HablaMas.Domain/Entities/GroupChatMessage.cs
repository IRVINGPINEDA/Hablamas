using HablaMas.Domain.Enums;

namespace HablaMas.Domain.Entities;

public class GroupChatMessage
{
    public Guid Id { get; set; }
    public Guid GroupChatId { get; set; }
    public Guid SenderId { get; set; }
    public string? Text { get; set; }
    public MessageType Type { get; set; } = MessageType.Text;
    public string? ImageUrl { get; set; }
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public string? AttachmentContentType { get; set; }
    public long? AttachmentSizeBytes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? ClientMessageId { get; set; }

    public GroupChat GroupChat { get; set; } = default!;
    public AppUser Sender { get; set; } = default!;
}
