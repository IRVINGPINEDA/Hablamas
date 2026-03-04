using System.ComponentModel.DataAnnotations;
using HablaMas.Domain.Enums;

namespace HablaMas.Api.Contracts.Profile;

public sealed class UpdateProfileRequest
{
    [MaxLength(280)]
    public string? Bio { get; set; }

    [MaxLength(80)]
    public string? PublicAlias { get; set; }

    [Required]
    public UserTheme Theme { get; set; }

    [Required, MaxLength(20)]
    public string AccentColor { get; set; } = "#0ea5e9";
}
