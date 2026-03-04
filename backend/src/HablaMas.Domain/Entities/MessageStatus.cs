using HablaMas.Domain.Enums;

namespace HablaMas.Domain.Entities;

public class MessageStatus
{
    public Guid Id { get; set; }
    public Guid MessageId { get; set; }
    public Guid RecipientId { get; set; }
    public MessageDeliveryStatus Status { get; set; } = MessageDeliveryStatus.Sent;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Message Message { get; set; } = default!;
    public AppUser Recipient { get; set; } = default!;
}
