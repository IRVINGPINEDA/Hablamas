namespace HablaMas.Infrastructure.Options;

public sealed class AnthropicOptions
{
    public const string SectionName = "ANTHROPIC";

    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "claude-3-5-sonnet-latest";
    public string BaseUrl { get; set; } = "https://api.anthropic.com/v1";
    public string Version { get; set; } = "2023-06-01";
    public string SystemPrompt { get; set; } = "Eres el asistente oficial de Habla Mas. Responde en espanol claro. Puedes ayudar con preguntas generales, codigo y analisis de imagenes.";
    public int MaxTokens { get; set; } = 1024;
    public int MaxImageMb { get; set; } = 5;
    public int MaxHistoryMessages { get; set; } = 12;
}
