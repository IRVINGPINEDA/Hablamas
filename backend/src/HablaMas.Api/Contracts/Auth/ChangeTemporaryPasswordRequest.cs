using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Auth;

public sealed class ChangeTemporaryPasswordRequest
{
    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required, MinLength(10), MaxLength(128)]
    public string NewPassword { get; set; } = string.Empty;
}
