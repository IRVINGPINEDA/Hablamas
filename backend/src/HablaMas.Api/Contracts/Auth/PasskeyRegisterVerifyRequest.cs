using Fido2NetLib;

namespace HablaMas.Api.Contracts.Auth;

public sealed class PasskeyRegisterVerifyRequest
{
    public string OperationId { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
    public string? AuthenticatorAttachment { get; set; }
    public AuthenticatorAttestationRawResponse Credential { get; set; } = null!;
}
