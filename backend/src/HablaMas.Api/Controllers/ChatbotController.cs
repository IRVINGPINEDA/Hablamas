using System.Net.Http.Headers;
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
    private readonly OpenAiOptions _openAiOptions;
    private readonly AppDbContext _dbContext;
    private readonly ILogger<ChatbotController> _logger;

    public ChatbotController(
        IHttpClientFactory httpClientFactory,
        IOptions<OpenAiOptions> openAiOptions,
        AppDbContext dbContext,
        ILogger<ChatbotController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _openAiOptions = openAiOptions.Value;
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

        if (string.IsNullOrWhiteSpace(_openAiOptions.ApiKey))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails { Title = "OpenAI API key not configured" });
        }

        var history = request.History ?? [];
        var images = request.Images ?? [];
        var messageText = request.Message?.Trim();
        if (string.IsNullOrWhiteSpace(messageText) && images.Count == 0)
        {
            return BadRequest(new ProblemDetails { Title = "Message or image is required" });
        }

        var maxImageBytes = _openAiOptions.MaxImageMb * 1024 * 1024;
        var userContent = new List<object>();
        if (!string.IsNullOrWhiteSpace(messageText))
        {
            userContent.Add(new { type = "text", text = messageText });
        }

        foreach (var image in images)
        {
            if (!AllowedImageTypes.Contains(image.ContentType))
            {
                return BadRequest(new ProblemDetails { Title = $"Unsupported image type: {image.ContentType}" });
            }

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(image.Base64Data);
            }
            catch
            {
                return BadRequest(new ProblemDetails { Title = $"Invalid base64 image: {image.Name}" });
            }

            if (bytes.Length > maxImageBytes)
            {
                return BadRequest(new ProblemDetails { Title = $"Image {image.Name} exceeds {_openAiOptions.MaxImageMb}MB." });
            }

            var normalized = Convert.ToBase64String(bytes);
            userContent.Add(new
            {
                type = "image_url",
                image_url = new
                {
                    url = $"data:{image.ContentType};base64,{normalized}"
                }
            });
        }

        var messages = new List<object>();
        if (!string.IsNullOrWhiteSpace(_openAiOptions.SystemPrompt))
        {
            messages.Add(new
            {
                role = "system",
                content = _openAiOptions.SystemPrompt.Trim()
            });
        }

        foreach (var item in history.TakeLast(_openAiOptions.MaxHistoryMessages))
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
            model = _openAiOptions.Model,
            messages
        };

        var client = _httpClientFactory.CreateClient("openai");
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{_openAiOptions.BaseUrl.TrimEnd('/')}/chat/completions");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _openAiOptions.ApiKey);
        httpRequest.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted);
        var rawResponse = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("OpenAI request failed with status {StatusCode}. Payload: {Response}", (int)response.StatusCode, rawResponse);
            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails { Title = "OpenAI request failed" });
        }

        var reply = ExtractReply(rawResponse);
        if (string.IsNullOrWhiteSpace(reply))
        {
            _logger.LogWarning("OpenAI returned empty content. Payload: {Response}", rawResponse);
            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails { Title = "OpenAI returned empty response" });
        }

        return Ok(new
        {
            reply,
            model = _openAiOptions.Model
        });
    }

    private static string? ExtractReply(string rawJson)
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
}
