namespace HablaMas.Application.DTOs;

public sealed class AuthResponseDto
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
