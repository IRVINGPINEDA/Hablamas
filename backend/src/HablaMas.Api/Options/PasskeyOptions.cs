namespace HablaMas.Api.Options;

public sealed class PasskeyOptions
{
    public const string SectionName = "Passkeys";

    public string RpId { get; set; } = string.Empty;
    public string RpName { get; set; } = "Habla Mas";
    public string[] Origins { get; set; } = [];
    public int TimeoutMs { get; set; } = 60000;
    public int OperationTtlSeconds { get; set; } = 300;
}
