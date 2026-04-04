namespace HablaMas.Domain.Entities;

public sealed class PasskeyCredential
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public byte[] CredentialId { get; set; } = [];
    public byte[] PublicKey { get; set; } = [];
    public uint SignatureCounter { get; set; }
    public string FriendlyName { get; set; } = "Acceso biometrico";
    public string DeviceType { get; set; } = string.Empty;
    public bool IsBackedUp { get; set; }
    public string Transports { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastUsedAt { get; set; }
}
