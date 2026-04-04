using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using HablaMas.Infrastructure.Options;
using Microsoft.Extensions.Options;

namespace HablaMas.Api.Services;

public sealed class FaceRecognitionDemoService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly OpenAiOptions _openAiOptions;
    private readonly ILogger<FaceRecognitionDemoService> _logger;

    public FaceRecognitionDemoService(
        IHttpClientFactory httpClientFactory,
        IOptions<OpenAiOptions> openAiOptions,
        ILogger<FaceRecognitionDemoService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _openAiOptions = openAiOptions.Value;
        _logger = logger;
    }

    public async Task<FaceRecognitionMatchResult> IdentifyUserAsync(
        string contentType,
        string base64Data,
        IReadOnlyCollection<FaceRecognitionCandidate> candidates,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_openAiOptions.ApiKey))
        {
            throw new InvalidOperationException("OpenAI API key not configured.");
        }

        if (candidates.Count == 0)
        {
            return new FaceRecognitionMatchResult(null, 0, "No hay muestras faciales registradas.");
        }

        var userContent = new List<object>
        {
            new
            {
                type = "text",
                text =
                    """
                    Analiza la primera imagen como selfie objetivo. Luego compara esa selfie contra las muestras de cada candidato.
                    Tu tarea es identificar si la selfie pertenece claramente a una sola persona de la lista.
                    Responde solo JSON valido con esta forma exacta:
                    {"matchedUserId":"guid o null","confidence":0-100,"reason":"texto corto"}
                    Reglas:
                    - Si no hay coincidencia facial suficientemente clara, matchedUserId debe ser null.
                    - Si hay duda entre dos personas, matchedUserId debe ser null.
                    - Usa confidence alta solo cuando el rostro parezca claramente la misma persona.
                    - Ignora ropa, fondo y calidad variable.
                    """
            },
            new
            {
                type = "image_url",
                image_url = new
                {
                    url = $"data:{contentType};base64,{base64Data}"
                }
            }
        };

        foreach (var candidate in candidates)
        {
            userContent.Add(new
            {
                type = "text",
                text = $"CANDIDATE id={candidate.UserId} alias={candidate.PublicAlias}"
            });

            foreach (var imageUrl in candidate.SampleImageUrls)
            {
                userContent.Add(new
                {
                    type = "image_url",
                    image_url = new { url = imageUrl }
                });
            }
        }

        var payload = new
        {
            model = _openAiOptions.Model,
            temperature = 0,
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content =
                        "Eres un clasificador visual para una demo escolar privada. Devuelves solo JSON y nunca markdown."
                },
                new
                {
                    role = "user",
                    content = userContent
                }
            }
        };

        var client = _httpClientFactory.CreateClient("openai");
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"{_openAiOptions.BaseUrl.TrimEnd('/')}/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _openAiOptions.ApiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        var rawResponse = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Face recognition demo request failed with status {StatusCode}. Payload: {Response}",
                (int)response.StatusCode,
                rawResponse);

            throw new FaceRecognitionProviderException(
                response.StatusCode,
                ExtractOpenAiCompatibleError(rawResponse) ?? "No se pudo analizar el rostro.");
        }

        var reply = ExtractOpenAiCompatibleReply(rawResponse);
        if (string.IsNullOrWhiteSpace(reply))
        {
            throw new FaceRecognitionProviderException(HttpStatusCode.BadGateway, "El proveedor devolvio una respuesta vacia.");
        }

        var normalizedReply = StripJsonFences(reply);

        try
        {
            using var document = JsonDocument.Parse(normalizedReply);
            var root = document.RootElement;

            string? matchedUserId = null;
            if (root.TryGetProperty("matchedUserId", out var matchedUserIdElement)
                && matchedUserIdElement.ValueKind == JsonValueKind.String)
            {
                matchedUserId = matchedUserIdElement.GetString();
            }

            var confidence = root.TryGetProperty("confidence", out var confidenceElement)
                && confidenceElement.TryGetInt32(out var parsedConfidence)
                    ? parsedConfidence
                    : 0;

            var reason = root.TryGetProperty("reason", out var reasonElement)
                && reasonElement.ValueKind == JsonValueKind.String
                    ? reasonElement.GetString()
                    : null;

            return new FaceRecognitionMatchResult(
                string.IsNullOrWhiteSpace(matchedUserId) ? null : matchedUserId,
                confidence,
                reason);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Face recognition demo returned invalid JSON: {Reply}", reply);
            throw new FaceRecognitionProviderException(HttpStatusCode.BadGateway, "La respuesta del analizador facial no fue valida.");
        }
    }

    private static string StripJsonFences(string value)
    {
        var trimmed = value.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var lines = trimmed.Split('\n');
        return string.Join('\n', lines.Skip(1).Take(lines.Length - 2)).Trim();
    }

    private static string? ExtractOpenAiCompatibleReply(string rawJson)
    {
        using var doc = JsonDocument.Parse(rawJson);
        if (!doc.RootElement.TryGetProperty("choices", out var choices) || choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() == 0)
        {
            return null;
        }

        var firstChoice = choices[0];
        if (!firstChoice.TryGetProperty("message", out var message))
        {
            return null;
        }

        if (!message.TryGetProperty("content", out var content))
        {
            return null;
        }

        if (content.ValueKind == JsonValueKind.String)
        {
            return content.GetString();
        }

        return null;
    }

    private static string? ExtractOpenAiCompatibleError(string rawJson)
    {
        if (string.IsNullOrWhiteSpace(rawJson))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            if (!doc.RootElement.TryGetProperty("error", out var error))
            {
                return null;
            }

            if (!error.TryGetProperty("message", out var message) || message.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            return message.GetString();
        }
        catch
        {
            return null;
        }
    }
}

public sealed record FaceRecognitionCandidate(
    string UserId,
    string PublicAlias,
    IReadOnlyList<string> SampleImageUrls);

public sealed record FaceRecognitionMatchResult(
    string? MatchedUserId,
    int Confidence,
    string? Reason);

public sealed class FaceRecognitionProviderException : Exception
{
    public HttpStatusCode StatusCode { get; }

    public FaceRecognitionProviderException(HttpStatusCode statusCode, string message)
        : base(message)
    {
        StatusCode = statusCode;
    }
}
