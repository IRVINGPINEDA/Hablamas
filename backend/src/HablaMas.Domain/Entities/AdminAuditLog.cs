namespace HablaMas.Domain.Entities;

public class AdminAuditLog
{
    public Guid Id { get; set; }
    public Guid AdminUserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public Guid TargetUserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string MetadataJson { get; set; } = "{}";

    public AppUser AdminUser { get; set; } = default!;
    public AppUser TargetUser { get; set; } = default!;
}
