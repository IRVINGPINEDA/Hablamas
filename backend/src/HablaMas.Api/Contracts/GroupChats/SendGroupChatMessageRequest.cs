using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.GroupChats;

public sealed class SendGroupChatMessageRequest
{
    [Required]
    [RegularExpression("^(text|image)$", ErrorMessage = "Type must be text or image.")]
    public string Type { get; set; } = "text";

    [MaxLength(4000)]
    public string? Text { get; set; }

    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    [MaxLength(120)]
    public string? ClientMessageId { get; set; }
}
