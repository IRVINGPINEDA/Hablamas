using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Admin;

public sealed class SetRoleRequest
{
    [Required]
    public string Role { get; set; } = "User";
}
