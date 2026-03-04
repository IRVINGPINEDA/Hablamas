using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.GroupChats;

public sealed class CreateGroupChatRequest
{
    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(50)]
    public List<Guid> MemberUserIds { get; set; } = [];
}
