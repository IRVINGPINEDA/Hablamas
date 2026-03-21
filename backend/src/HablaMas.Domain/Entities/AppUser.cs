using HablaMas.Domain.Enums;
using Microsoft.AspNetCore.Identity;

namespace HablaMas.Domain.Entities;

public class AppUser : IdentityUser<Guid>
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string? ProfileImageUrl { get; set; }
    public string PublicCode { get; set; } = string.Empty;
    public string PublicAlias { get; set; } = string.Empty;
    public UserTheme Theme { get; set; } = UserTheme.Light;
    public string AccentColor { get; set; } = "#0ea5e9";
    public bool MustChangePassword { get; set; } = true;
    public bool IsBlocked { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAt { get; set; }

    public ICollection<Contact> Contacts { get; set; } = new List<Contact>();
    public ICollection<Conversation> ConversationsA { get; set; } = new List<Conversation>();
    public ICollection<Conversation> ConversationsB { get; set; } = new List<Conversation>();
    public ICollection<GroupChat> OwnedGroupChats { get; set; } = new List<GroupChat>();
    public ICollection<GroupChatMember> GroupChatMemberships { get; set; } = new List<GroupChatMember>();
    public ICollection<PasskeyCredential> PasskeyCredentials { get; set; } = new List<PasskeyCredential>();
    public ICollection<WebPushSubscription> WebPushSubscriptions { get; set; } = new List<WebPushSubscription>();
}
