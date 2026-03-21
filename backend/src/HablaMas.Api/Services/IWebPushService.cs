namespace HablaMas.Api.Services;

public interface IWebPushService
{
    bool IsConfigured { get; }
    string? PublicKey { get; }
    Task SaveSubscriptionAsync(Guid userId, string endpoint, string p256Dh, string auth, string? userAgent, CancellationToken cancellationToken = default);
    Task RemoveSubscriptionAsync(Guid userId, string endpoint, CancellationToken cancellationToken = default);
    Task SendNotificationAsync(IEnumerable<Guid> userIds, string title, string body, string url, string tag, CancellationToken cancellationToken = default);
}
