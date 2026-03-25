namespace HablaMas.Api.Contracts.Auth;

public sealed class PasskeyListItemDto
{
    public Guid Id { get; set; }
    public string FriendlyName { get; set; } = string.Empty;
    public string CredentialId { get; set; } = string.Empty;
    public string? AuthenticatorAttachment { get; set; }
    public string[] Transports { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
}
