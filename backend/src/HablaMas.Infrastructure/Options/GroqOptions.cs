namespace HablaMas.Infrastructure.Options;

public sealed class GroqOptions
{
    public const string SectionName = "GROQ";

    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "meta-llama/llama-4-scout-17b-16e-instruct";
    public string BaseUrl { get; set; } = "https://api.groq.com/openai/v1";
    public string SystemPrompt { get; set; } = "Eres el asistente oficial de Habla Mas. Responde en espanol claro. Puedes ayudar con preguntas generales, codigo y analisis de imagenes.";
    public int MaxImageMb { get; set; } = 4;
    public int MaxHistoryMessages { get; set; } = 12;
}
