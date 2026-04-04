using Fido2NetLib;

namespace HablaMas.Api.Contracts.Auth;

public sealed class PasskeyRegisterVerifyRequest
{
    public string? FriendlyName { get; set; }
    public AuthenticatorAttestationRawResponse? Credential { get; set; }
}
