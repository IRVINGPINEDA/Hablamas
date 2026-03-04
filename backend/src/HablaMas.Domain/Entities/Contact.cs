namespace HablaMas.Domain.Entities;

public class Contact
{
    public Guid Id { get; set; }
    public Guid OwnerUserId { get; set; }
    public Guid ContactUserId { get; set; }
    public string? Alias { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public AppUser OwnerUser { get; set; } = default!;
    public AppUser ContactUser { get; set; } = default!;
}
