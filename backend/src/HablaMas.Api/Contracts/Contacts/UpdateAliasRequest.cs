using System.ComponentModel.DataAnnotations;

namespace HablaMas.Api.Contracts.Contacts;

public sealed class UpdateAliasRequest
{
    [MaxLength(80)]
    public string? Alias { get; set; }
}
