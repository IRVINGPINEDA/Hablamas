using Fido2NetLib;

namespace HablaMas.Api.Contracts.Auth;

public sealed class PasskeyAuthenticateVerifyRequest
{
    public string OperationId { get; set; } = string.Empty;
    public AuthenticatorAssertionRawResponse? Credential { get; set; }
}
