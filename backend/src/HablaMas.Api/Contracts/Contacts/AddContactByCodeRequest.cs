using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Contacts;

public sealed class AddContactByCodeRequest
{
    [Required, MaxLength(24)]
    public string PublicCode { get; set; } = string.Empty;
}
