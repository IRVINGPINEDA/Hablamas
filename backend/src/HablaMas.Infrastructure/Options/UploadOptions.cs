namespace HablaMas.Infrastructure.Options;

public sealed class UploadOptions
{
    public const string SectionName = "UPLOADS";

    public string Path { get; set; } = "/uploads";
    public int MaxMb { get; set; } = 5;
}
