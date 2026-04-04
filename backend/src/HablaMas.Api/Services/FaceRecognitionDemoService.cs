using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using HablaMas.Infrastructure.Options;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace HablaMas.Api.Services;

public sealed class FaceRecognitionDemoService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GroqOptions _groqOptions;
    private readonly UploadOptions _uploadOptions;
    private readonly string _appBaseUrl;
    private readonly ILogger<FaceRecognitionDemoService> _logger;

    public FaceRecognitionDemoService(
        IHttpClientFactory httpClientFactory,
        IOptions<GroqOptions> groqOptions,
        IOptions<UploadOptions> uploadOptions,
        IConfiguration configuration,
        ILogger<FaceRecognitionDemoService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _groqOptions = groqOptions.Value;
        _uploadOptions = uploadOptions.Value;
        _appBaseUrl = configuration["APP_BASE_URL"]?.TrimEnd('/') ?? string.Empty;
        _logger = logger;
    }

    public async Task<FaceRecognitionMatchResult> IdentifyUserAsync(
        string contentType,
        string base64Data,
        IReadOnlyCollection<FaceRecognitionCandidate> candidates,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_groqOptions.ApiKey))
        {
            throw new InvalidOperationException("Groq API key not configured.");
        }

        if (candidates.Count == 0)
        {
            return new FaceRecognitionMatchResult(null, 0, "No hay muestras faciales registradas.");
        }

        var candidateResults = new List<FaceRecognitionMatchResult>();

        foreach (var candidate in candidates)
        {
            var result = await EvaluateCandidateAsync(contentType, base64Data, candidate, cancellationToken);
            if (!string.IsNullOrWhiteSpace(result.MatchedUserId))
            {
                candidateResults.Add(result);
            }
        }

        if (candidateResults.Count == 0)
        {
            return new FaceRecognitionMatchResult(null, 0, "La selfie no coincide claramente con ningun perfil.");
        }

        var ordered = candidateResults
            .OrderByDescending(x => x.Confidence)
            .ToList();

        if (ordered.Count == 1)
        {
            return ordered[0];
        }

        var best = ordered[0];
        var secondBest = ordered[1];

        if (best.Confidence < 85 || best.Confidence - secondBest.Confidence < 8)
        {
            return new FaceRecognitionMatchResult(
                null,
                best.Confidence,
                "La comparacion facial quedo demasiado cerrada entre varios perfiles.");
        }

        return best;
    }

    private async Task<FaceRecognitionMatchResult> EvaluateCandidateAsync(
        string contentType,
        string base64Data,
        FaceRecognitionCandidate candidate,
        CancellationToken cancellationToken)
    {
        var userContent = new List<object>
        {
            new
            {
                type = "text",
                text =
                    """
                    Analiza la primera imagen como selfie objetivo. Luego compara esa selfie contra las muestras de cada candidato.
                    Tu tarea es decidir si la selfie pertenece o no al candidato mostrado.
                    Responde solo JSON valido con esta forma exacta:
                    {"matchedUserId":"guid o null","confidence":0-100,"reason":"texto corto"}
                    Reglas:
                    - Si no hay coincidencia facial suficientemente clara, matchedUserId debe ser null.
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

        userContent.Add(new
        {
            type = "text",
            text = $"CANDIDATE id={candidate.UserId} alias={candidate.PublicAlias}"
        });

        foreach (var imageReference in candidate.SampleImageUrls.Take(2))
        {
            userContent.Add(new
            {
                type = "image_url",
                image_url = new
                {
                    url = await NormalizeImageReferenceAsync(imageReference, cancellationToken)
                }
            });
        }

        var payload = new
        {
            model = _groqOptions.Model,
            temperature = 0,
            response_format = new
            {
                type = "json_schema",
                json_schema = new
                {
                    name = "face_match_result",
                    strict = true,
                    schema = new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            matchedUserId = new
                            {
                                type = new[] { "string", "null" }
                            },
                            confidence = new
                            {
                                type = "integer"
                            },
                            reason = new
                            {
                                type = "string"
                            }
                        },
                        required = new[] { "matchedUserId", "confidence", "reason" }
                    }
                }
            },
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content = "Eres un clasificador visual para una demo escolar privada. Devuelves solo JSON y nunca markdown."
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
            $"{_groqOptions.BaseUrl.TrimEnd('/')}/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _groqOptions.ApiKey);
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

    private async Task<string> NormalizeImageReferenceAsync(string imageReference, CancellationToken cancellationToken)
    {
        if (imageReference.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            return imageReference;
        }

        var localPath = TryResolveLocalUploadPath(imageReference);
        if (localPath is not null && File.Exists(localPath))
        {
            var bytes = await File.ReadAllBytesAsync(localPath, cancellationToken);
            return $"data:{GetContentTypeFromPath(localPath)};base64,{Convert.ToBase64String(bytes)}";
        }

        return imageReference;
    }

    private string? TryResolveLocalUploadPath(string imageReference)
    {
        if (string.IsNullOrWhiteSpace(imageReference))
        {
            return null;
        }

        string? fileName = null;

        if (imageReference.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
        {
            fileName = Path.GetFileName(imageReference);
        }
        else if (!string.IsNullOrWhiteSpace(_appBaseUrl)
                 && imageReference.StartsWith($"{_appBaseUrl}/uploads/", StringComparison.OrdinalIgnoreCase))
        {
            fileName = Path.GetFileName(new Uri(imageReference).AbsolutePath);
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            return null;
        }

        return Path.Combine(_uploadOptions.Path, fileName);
    }

    private static string GetContentTypeFromPath(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg"
        };
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
