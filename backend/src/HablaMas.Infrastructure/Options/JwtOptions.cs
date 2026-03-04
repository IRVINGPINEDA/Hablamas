namespace HablaMas.Infrastructure.Options;

public sealed class JwtOptions
{
    public const string SectionName = "JWT";

    public string Issuer { get; set; } = "HablaMas";
    public string Audience { get; set; } = "HablaMasWeb";
    public string Key { get; set; } = string.Empty;
    public int AccessTokenMinutes { get; set; } = 30;
    public int RefreshTokenDays { get; set; } = 14;
}
