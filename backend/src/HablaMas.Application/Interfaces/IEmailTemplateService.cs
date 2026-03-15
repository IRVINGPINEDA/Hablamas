namespace HablaMas.Application.Interfaces;

public interface IEmailTemplateService
{
    string BuildVerificationEmail(string recipientName, string verifyUrl, string? temporaryPassword = null, bool pendingVerification = false);
    string BuildPasswordResetEmail(string recipientName, string resetUrl);
    string BuildForcedTemporaryPasswordEmail(string recipientName, string temporaryPassword);
}
