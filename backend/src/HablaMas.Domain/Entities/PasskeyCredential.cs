namespace HablaMas.Domain.Entities;

public sealed class PasskeyCredential
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public byte[] CredentialId { get; set; } = [];
    public byte[] PublicKey { get; set; } = [];
    public long SignCount { get; set; }
    public byte[] UserHandle { get; set; } = [];
    public string FriendlyName { get; set; } = string.Empty;
    public string? AaGuid { get; set; }
    public string? AuthenticatorAttachment { get; set; }
    public string? TransportsJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastUsedAt { get; set; }
}
