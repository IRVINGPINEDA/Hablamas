using System.Net.Http.Headers;
using System.Net;
using System.Text;
using System.Text.Json;
using HablaMas.Api.Contracts.Chatbot;
using HablaMas.Api.Extensions;
using HablaMas.Infrastructure.Data;
using HablaMas.Infrastructure.Options;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/chatbot")]
[Authorize]
public sealed class ChatbotController : ControllerBase
{
    private static readonly HashSet<string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp"
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly AiOptions _aiOptions;
    private readonly GroqOptions _groqOptions;
    private readonly OpenAiOptions _openAiOptions;
    private readonly AnthropicOptions _anthropicOptions;
    private readonly AppDbContext _dbContext;
    private readonly ILogger<ChatbotController> _logger;

    public ChatbotController(
        IHttpClientFactory httpClientFactory,
        IOptions<AiOptions> aiOptions,
        IOptions<GroqOptions> groqOptions,
        IOptions<OpenAiOptions> openAiOptions,
        IOptions<AnthropicOptions> anthropicOptions,
        AppDbContext dbContext,
        ILogger<ChatbotController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _aiOptions = aiOptions.Value;
        _groqOptions = groqOptions.Value;
        _openAiOptions = openAiOptions.Value;
        _anthropicOptions = anthropicOptions.Value;
        _dbContext = dbContext;
        _logger = logger;
    }

    [HttpPost("message")]
    public async Task<IActionResult> SendMessage([FromBody] ChatbotMessageRequest request)
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var history = request.History ?? [];
        var images = request.Images ?? [];
        var messageText = request.Message?.Trim();
        if (string.IsNullOrWhiteSpace(messageText) && images.Count == 0)
        {
            return BadRequest(new ProblemDetails { Title = "Message or image is required" });
        }

        var provider = (_aiOptions.Provider ?? string.Empty).Trim().ToLowerInvariant();
        return provider switch
        {
            "" => await SendWithGroqAsync(history, images, messageText),
            "groq" => await SendWithGroqAsync(history, images, messageText),
            "openai" => await SendWithOpenAiAsync(history, images, messageText),
            "openrouter" => await SendWithOpenAiAsync(history, images, messageText),
            "anthropic" or "claude" => await SendWithAnthropicAsync(history, images, messageText),
            _ => StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Title = "Unsupported AI provider",
                Detail = "Configura AI:Provider con 'groq', 'openai', 'openrouter' o 'anthropic'."
            })
        };
    }

    private Task<IActionResult> SendWithGroqAsync(
        IReadOnlyCollection<ChatbotHistoryMessageRequest> history,
        IReadOnlyCollection<ChatbotImageRequest> images,
        string? messageText)
    {
        return SendWithOpenAiCompatibleAsync(
            history,
            images,
            messageText,
            providerName: "Groq",
            apiKey: _groqOptions.ApiKey,
            model: _groqOptions.Model,
            baseUrl: _groqOptions.BaseUrl,
            systemPrompt: _groqOptions.SystemPrompt,
            maxImageMb: _groqOptions.MaxImageMb,
            maxHistoryMessages: _groqOptions.MaxHistoryMessages,
            missingKeyTitle: "Groq API key not configured",
            quotaFallback: "Se alcanzo el limite de cuota en Groq.",
            authFallback: "La configuracion de Groq no es valida.");
    }

    private Task<IActionResult> SendWithOpenAiAsync(
        IReadOnlyCollection<ChatbotHistoryMessageRequest> history,
        IReadOnlyCollection<ChatbotImageRequest> images,
        string? messageText)
    {
        return SendWithOpenAiCompatibleAsync(
            history,
            images,
            messageText,
            providerName: "OpenAI",
            apiKey: _openAiOptions.ApiKey,
            model: _openAiOptions.Model,
            baseUrl: _openAiOptions.BaseUrl,
            systemPrompt: _openAiOptions.SystemPrompt,
            maxImageMb: _openAiOptions.MaxImageMb,
            maxHistoryMessages: _openAiOptions.MaxHistoryMessages,
            missingKeyTitle: "OpenAI API key not configured",
            quotaFallback: "Se alcanzo el limite de cuota en OpenAI.",
            authFallback: "La configuracion de OpenAI no es valida.");
    }

    private async Task<IActionResult> SendWithAnthropicAsync(
        IReadOnlyCollection<ChatbotHistoryMessageRequest> history,
        IReadOnlyCollection<ChatbotImageRequest> images,
        string? messageText)
    {
        if (string.IsNullOrWhiteSpace(_anthropicOptions.ApiKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails { Title = "Anthropic API key not configured" });
        }

        var (normalizedImages, imageError) = NormalizeImages(images, _anthropicOptions.MaxImageMb);
        if (imageError is not null)
        {
            return BadRequest(imageError);
        }

        var messages = new List<object>();
        foreach (var item in history.TakeLast(_anthropicOptions.MaxHistoryMessages))
        {
            var role = item.Role.Trim().ToLowerInvariant();
            if (role is not ("user" or "assistant"))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(item.Content))
            {
                continue;
            }

            messages.Add(new
            {
                role,
                content = item.Content.Trim()
            });
        }

        var userContent = new List<object>();
        if (!string.IsNullOrWhiteSpace(messageText))
        {
            userContent.Add(new { type = "text", text = messageText });
        }

        foreach (var image in normalizedImages!)
        {
            userContent.Add(new
            {
                type = "image",
                source = new
                {
                    type = "base64",
                    media_type = image.ContentType,
                    data = image.Base64Data
                }
            });
        }

        messages.Add(new
        {
            role = "user",
            content = userContent
        });

        var payload = new Dictionary<string, object?>
        {
            ["model"] = _anthropicOptions.Model,
            ["max_tokens"] = _anthropicOptions.MaxTokens,
            ["messages"] = messages
        };

        if (!string.IsNullOrWhiteSpace(_anthropicOptions.SystemPrompt))
        {
            payload["system"] = _anthropicOptions.SystemPrompt.Trim();
        }

        var client = _httpClientFactory.CreateClient("openai");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{_anthropicOptions.BaseUrl.TrimEnd('/')}/messages");
        httpRequest.Headers.TryAddWithoutValidation("x-api-key", _anthropicOptions.ApiKey);
        httpRequest.Headers.TryAddWithoutValidation("anthropic-version", _anthropicOptions.Version);
        httpRequest.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted);
        var rawResponse = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Anthropic request failed with status {StatusCode}. Payload: {Response}", (int)response.StatusCode, rawResponse);
            var upstreamMessage = ExtractAnthropicError(rawResponse);
            return BuildProviderError(
                providerName: "Anthropic",
                statusCode: response.StatusCode,
                upstreamMessage: upstreamMessage,
                quotaFallback: "Se alcanzo el limite de cuota en Anthropic.",
                authFallback: "La configuracion de Anthropic no es valida.");
        }

        var reply = ExtractAnthropicReply(rawResponse);
        if (string.IsNullOrWhiteSpace(reply))
        {
            _logger.LogWarning("Anthropic returned empty content. Payload: {Response}", rawResponse);
            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails { Title = "Anthropic returned empty response" });
        }

        return Ok(new
        {
            reply,
            model = _anthropicOptions.Model
        });
    }

    private async Task<IActionResult> SendWithOpenAiCompatibleAsync(
        IReadOnlyCollection<ChatbotHistoryMessageRequest> history,
        IReadOnlyCollection<ChatbotImageRequest> images,
        string? messageText,
        string providerName,
        string apiKey,
        string model,
        string baseUrl,
        string systemPrompt,
        int maxImageMb,
        int maxHistoryMessages,
        string missingKeyTitle,
        string quotaFallback,
        string authFallback)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails { Title = missingKeyTitle });
        }

        var (normalizedImages, imageError) = NormalizeImages(images, maxImageMb);
        if (imageError is not null)
        {
            return BadRequest(imageError);
        }

        var userContent = new List<object>();
        if (!string.IsNullOrWhiteSpace(messageText))
        {
            userContent.Add(new { type = "text", text = messageText });
        }

        foreach (var image in normalizedImages!)
        {
            userContent.Add(new
            {
                type = "image_url",
                image_url = new
                {
                    url = $"data:{image.ContentType};base64,{image.Base64Data}"
                }
            });
        }

        var messages = new List<object>();
        if (!string.IsNullOrWhiteSpace(systemPrompt))
        {
            messages.Add(new
            {
                role = "system",
                content = systemPrompt.Trim()
            });
        }

        foreach (var item in history.TakeLast(maxHistoryMessages))
        {
            var role = item.Role.Trim().ToLowerInvariant();
            if (role is not ("user" or "assistant"))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(item.Content))
            {
                continue;
            }

            messages.Add(new
            {
                role,
                content = item.Content.Trim()
            });
        }

        messages.Add(new
        {
            role = "user",
            content = userContent
        });

        var payload = new
        {
            model,
            messages
        };

        var client = _httpClientFactory.CreateClient("openai");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl.TrimEnd('/')}/chat/completions");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        httpRequest.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted);
        var rawResponse = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("{ProviderName} request failed with status {StatusCode}. Payload: {Response}", providerName, (int)response.StatusCode, rawResponse);
            var upstreamMessage = ExtractOpenAiCompatibleError(rawResponse);
            return BuildProviderError(providerName, response.StatusCode, upstreamMessage, quotaFallback, authFallback);
        }

        var reply = ExtractOpenAiCompatibleReply(rawResponse);
        if (string.IsNullOrWhiteSpace(reply))
        {
            _logger.LogWarning("{ProviderName} returned empty content. Payload: {Response}", providerName, rawResponse);
            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails { Title = $"{providerName} returned empty response" });
        }

        return Ok(new
        {
            reply,
            model
        });
    }

    private IActionResult BuildProviderError(
        string providerName,
        HttpStatusCode statusCode,
        string? upstreamMessage,
        string quotaFallback,
        string authFallback)
    {
        if (statusCode == HttpStatusCode.TooManyRequests)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new ProblemDetails
            {
                Title = $"{providerName} quota exceeded",
                Detail = upstreamMessage ?? quotaFallback
            });
        }

        if (statusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Title = $"{providerName} authentication failed",
                Detail = upstreamMessage ?? authFallback
            });
        }

        return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails
        {
            Title = $"{providerName} request failed",
            Detail = upstreamMessage ?? "No se pudo completar la solicitud al proveedor de IA."
        });
    }

    private static (List<NormalizedImage>? Images, ProblemDetails? Error) NormalizeImages(
        IReadOnlyCollection<ChatbotImageRequest> images,
        int maxImageMb)
    {
        var maxImageBytes = maxImageMb * 1024 * 1024;
        var normalizedImages = new List<NormalizedImage>(images.Count);

        foreach (var image in images)
        {
            if (!AllowedImageTypes.Contains(image.ContentType))
            {
                return (null, new ProblemDetails { Title = $"Unsupported image type: {image.ContentType}" });
            }

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(image.Base64Data);
            }
            catch
            {
                return (null, new ProblemDetails { Title = $"Invalid base64 image: {image.Name}" });
            }

            if (bytes.Length > maxImageBytes)
            {
                return (null, new ProblemDetails { Title = $"Image {image.Name} exceeds {maxImageMb}MB." });
            }

            normalizedImages.Add(new NormalizedImage(image.Name, image.ContentType, Convert.ToBase64String(bytes)));
        }

        return (normalizedImages, null);
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

        if (content.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var builder = new StringBuilder();
        foreach (var item in content.EnumerateArray())
        {
            if (!item.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            if (builder.Length > 0)
            {
                builder.AppendLine();
            }

            builder.Append(text.GetString());
        }

        return builder.ToString().Trim();
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

    private static string? ExtractAnthropicReply(string rawJson)
    {
        using var doc = JsonDocument.Parse(rawJson);
        if (doc.RootElement.TryGetProperty("content", out var content)
            && content.ValueKind == JsonValueKind.Array
            && content.GetArrayLength() > 0)
        {
            var builder = new StringBuilder();
            foreach (var item in content.EnumerateArray())
            {
                if (!item.TryGetProperty("type", out var type)
                    || type.ValueKind != JsonValueKind.String
                    || !string.Equals(type.GetString(), "text", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (!item.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                if (builder.Length > 0)
                {
                    builder.AppendLine();
                }

                builder.Append(text.GetString());
            }

            return builder.ToString().Trim();
        }

        return null;
    }

    private static string? ExtractAnthropicError(string rawJson)
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

    private async Task<IActionResult?> EnsureCanChatAsync(Guid userId)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.IsBlocked)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "User blocked" });
        }

        if (!user.EmailConfirmed)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "Email not confirmed" });
        }

        if (user.MustChangePassword)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "Password change required" });
        }

        return null;
    }

    private sealed record NormalizedImage(string Name, string ContentType, string Base64Data);
}
