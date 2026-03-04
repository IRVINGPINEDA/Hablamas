namespace HablaMas.Api.Contracts.Chat;

public sealed class MarkSeenRequest
{
    public Guid? LastSeenMessageId { get; set; }
}
