using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Auth;

public sealed class FaceLoginRequest
{
    [Required]
    public string Base64Data { get; set; } = string.Empty;

    [Required]
    public string ContentType { get; set; } = "image/jpeg";
}
