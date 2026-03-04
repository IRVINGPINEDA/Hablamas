using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.GroupChats;

public sealed class AddGroupChatMemberRequest
{
    [Required]
    public Guid UserId { get; set; }
}
