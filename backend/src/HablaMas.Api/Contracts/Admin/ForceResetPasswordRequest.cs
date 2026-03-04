namespace HablaMas.Api.Contracts.Admin;

public sealed class ForceResetPasswordRequest
{
    public bool SendEmail { get; set; } = true;
}
