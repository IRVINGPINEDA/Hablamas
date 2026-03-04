using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Auth;

public sealed class ResendVerificationRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
}
