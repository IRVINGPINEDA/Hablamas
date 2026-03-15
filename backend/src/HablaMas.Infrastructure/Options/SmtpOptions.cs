namespace HablaMas.Infrastructure.Options;

public sealed class SmtpOptions
{
    public const string SectionName = "SMTP";

    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string User { get; set; } = string.Empty;
    public string Pass { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string FromName { get; set; } = "Habla Mas";
    public bool UseSsl { get; set; }
}
