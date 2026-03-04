using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Chatbot;

public sealed class ChatbotMessageRequest
{
    [MaxLength(8_000)]
    public string? Message { get; set; }

    [MaxLength(20)]
    public List<ChatbotHistoryMessageRequest> History { get; set; } = [];

    [MaxLength(4)]
    public List<ChatbotImageRequest> Images { get; set; } = [];
}
