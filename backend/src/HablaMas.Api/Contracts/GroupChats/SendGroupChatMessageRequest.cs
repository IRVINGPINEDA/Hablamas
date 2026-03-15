using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.GroupChats;

public sealed class SendGroupChatMessageRequest
{
    [Required]
    [RegularExpression("^(text|image|video|file|audio)$", ErrorMessage = "Type must be text, image, video, file or audio.")]
    public string Type { get; set; } = "text";

    [MaxLength(4000)]
    public string? Text { get; set; }

    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    [MaxLength(500)]
    public string? AttachmentUrl { get; set; }

    [MaxLength(255)]
    public string? AttachmentName { get; set; }

    [MaxLength(120)]
    public string? AttachmentContentType { get; set; }

    public long? AttachmentSizeBytes { get; set; }

    [MaxLength(120)]
    public string? ClientMessageId { get; set; }
}
