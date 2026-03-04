using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Chatbot;

public sealed class ChatbotHistoryMessageRequest
{
    [Required]
    [RegularExpression("^(user|assistant)$", ErrorMessage = "Role must be user or assistant.")]
    public string Role { get; set; } = string.Empty;

    [Required]
    [MaxLength(8_000)]
    public string Content { get; set; } = string.Empty;
}
