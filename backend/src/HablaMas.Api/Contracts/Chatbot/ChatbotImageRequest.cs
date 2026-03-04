using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Chatbot;

public sealed class ChatbotImageRequest
{
    [Required]
    [MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ContentType { get; set; } = string.Empty;

    [Required]
    [MaxLength(10_000_000)]
    public string Base64Data { get; set; } = string.Empty;
}
