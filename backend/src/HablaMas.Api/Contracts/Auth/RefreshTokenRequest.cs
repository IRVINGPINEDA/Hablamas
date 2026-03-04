using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Auth;

public sealed class RefreshTokenRequest
{
    [Required]
    public string RefreshToken { get; set; } = string.Empty;
}
