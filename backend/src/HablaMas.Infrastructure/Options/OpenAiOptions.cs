namespace HablaMas.Infrastructure.Options;

public sealed class OpenAiOptions
{
    public const string SectionName = "OPENAI";

    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "gpt-4o-mini";
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
    public string SystemPrompt { get; set; } = "Eres el asistente oficial de Habla Mas. Responde en espanol claro. Puedes ayudar con preguntas generales, codigo y analisis de imagenes.";
    public int MaxImageMb { get; set; } = 5;
    public int MaxHistoryMessages { get; set; } = 12;
}
