using System.Text.Json.Serialization;

namespace AppMovilHablamas.Models;

public sealed class ProblemDetailsDto
{
    public string? Title { get; set; }
    public string? Detail { get; set; }
    public Dictionary<string, string[]>? Errors { get; set; }
}

public sealed class AuthPayloadDto
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public bool MustChangePassword { get; set; }
    public bool EmailConfirmed { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PublicAlias { get; set; } = string.Empty;
    public string[] Roles { get; set; } = [];
}

public sealed class MobileUserDto
{
    public string Id { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string PublicAlias { get; set; } = string.Empty;
    public string PublicCode { get; set; } = string.Empty;
    public int Theme { get; set; } = 1;
    public string AccentColor { get; set; } = "#5f7888";
    public bool EmailConfirmed { get; set; }
    public bool MustChangePassword { get; set; }
    public string? ProfileImageUrl { get; set; }
    public string[] Roles { get; set; } = [];
}

public sealed class RegisterRequestDto
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string? PublicAlias { get; set; }
}

public sealed class ProfileDto
{
    public string Id { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string PublicAlias { get; set; } = string.Empty;
    public string PublicCode { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string? ProfileImageUrl { get; set; }
    public int Theme { get; set; } = 1;
    public string AccentColor { get; set; } = "#5f7888";
    public bool EmailConfirmed { get; set; }
    public bool MustChangePassword { get; set; }
}

public sealed class ConversationSummaryDto
{
    public Guid Id { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastMessageAt { get; set; }
    public ConversationContactDto Contact { get; set; } = new();
    public ConversationLastMessageDto? LastMessage { get; set; }
}

public sealed class ConversationContactDto
{
    public Guid Id { get; set; }
    public string PublicAlias { get; set; } = string.Empty;
    public string? Alias { get; set; }
    public string PublicCode { get; set; } = string.Empty;
    public string? ProfileImageUrl { get; set; }
}

public sealed class ConversationLastMessageDto
{
    public Guid Id { get; set; }
    public string? Text { get; set; }
    public string Type { get; set; } = "text";
    public string? ImageUrl { get; set; }
    public Guid SenderId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class PagedResponseDto<T>
{
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int Total { get; set; }
    public List<T> Items { get; set; } = [];
}

public sealed class MessageDto
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderAlias { get; set; } = string.Empty;
    public string? Text { get; set; }
    public string Type { get; set; } = "text";
    public string? ImageUrl { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string Status { get; set; } = "Sent";
}

public sealed class ContactDto
{
    public Guid Id { get; set; }
    public string? Alias { get; set; }
    public ContactUserDto ContactUser { get; set; } = new();
}

public sealed class ContactUserDto
{
    public Guid Id { get; set; }
    public string PublicAlias { get; set; } = string.Empty;
    public string PublicCode { get; set; } = string.Empty;
    public string? ProfileImageUrl { get; set; }
    public string? Bio { get; set; }
    public bool EmailConfirmed { get; set; }
}

public sealed class AddContactResponseDto
{
    public string Message { get; set; } = string.Empty;
    public Guid ConversationId { get; set; }
}

public sealed class GroupSummaryDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastMessageAt { get; set; }
    public int MemberCount { get; set; }
    public ConversationLastMessageDto? LastMessage { get; set; }
}

public sealed class GroupMemberDto
{
    public Guid Id { get; set; }
    public string PublicAlias { get; set; } = string.Empty;
    public string PublicCode { get; set; } = string.Empty;
    public string? ProfileImageUrl { get; set; }
    public DateTimeOffset JoinedAt { get; set; }
}

public sealed class GroupMessageDto
{
    public Guid Id { get; set; }
    public Guid GroupChatId { get; set; }
    public Guid SenderId { get; set; }
    public string SenderAlias { get; set; } = string.Empty;
    public string? Text { get; set; }
    public string Type { get; set; } = "text";
    public string? ImageUrl { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ChatbotReplyDto
{
    public string Reply { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
}

public sealed class ChatbotImageDto
{
    public string Name { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string Base64Data { get; set; } = string.Empty;

    [JsonIgnore]
    public string? LocalPath { get; set; }
}

public sealed class ChatbotHistoryItemDto
{
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}

public sealed class UploadResponseDto
{
    public string Url { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public string? MessageType { get; set; }
}

public sealed class HubMessageEnvelopeDto
{
    public Guid ConversationId { get; set; }
    public HubMessageDto Message { get; set; } = new();
}

public sealed class HubMessageDto
{
    public Guid Id { get; set; }
    public Guid ConversationId { get; set; }
    public Guid SenderId { get; set; }
    public string? Text { get; set; }
    public string Type { get; set; } = "text";
    public string? ImageUrl { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string? ClientMessageId { get; set; }
}

public sealed class HubStatusDto
{
    public Guid ConversationId { get; set; }
    public Guid? MessageId { get; set; }
    public string Status { get; set; } = "Sent";
    public Guid RecipientId { get; set; }
    public Guid? LastSeenMessageId { get; set; }
}

public sealed class HubTypingDto
{
    public Guid ConversationId { get; set; }
    public Guid UserId { get; set; }
    public bool IsTyping { get; set; }
}

public sealed class HubPresenceDto
{
    public Guid UserId { get; set; }
    public bool Online { get; set; }
}
