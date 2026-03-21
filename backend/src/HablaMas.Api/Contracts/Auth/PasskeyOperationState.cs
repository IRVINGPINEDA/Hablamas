namespace HablaMas.Api.Contracts.Auth;

public sealed class PasskeyRegistrationState
{
    public Guid UserId { get; set; }
    public string OptionsJson { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
}

public sealed class PasskeyAuthenticationState
{
    public string OptionsJson { get; set; } = string.Empty;
    public string? RequestedEmail { get; set; }
}
