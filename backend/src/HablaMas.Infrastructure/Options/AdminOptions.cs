namespace HablaMas.Infrastructure.Options;

public sealed class AdminOptions
{
    public const string SectionName = "ADMIN";

    public string SeedEmail { get; set; } = "admin@caleiro.online";
    public string SeedPassword { get; set; } = string.Empty;
}
