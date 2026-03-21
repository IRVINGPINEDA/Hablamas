using System.Text.Json;
using HablaMas.Api.Options;
using HablaMas.Domain.Entities;
using HablaMas.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WebPush;

namespace HablaMas.Api.Services;

public sealed class WebPushService : IWebPushService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _dbContext;
    private readonly WebPushOptions _options;
    private readonly WebPushClient _client;
    private readonly ILogger<WebPushService> _logger;

    public WebPushService(
        AppDbContext dbContext,
        IOptions<WebPushOptions> options,
        ILogger<WebPushService> logger)
    {
        _dbContext = dbContext;
        _options = options.Value;
        _client = new WebPushClient();
        _logger = logger;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.PublicKey) &&
        !string.IsNullOrWhiteSpace(_options.PrivateKey) &&
        !string.IsNullOrWhiteSpace(_options.Subject);

    public string? PublicKey => IsConfigured ? _options.PublicKey : null;

    public async Task SaveSubscriptionAsync(Guid userId, string endpoint, string p256Dh, string auth, string? userAgent, CancellationToken cancellationToken = default)
    {
        var normalizedEndpoint = endpoint.Trim();
        var subscription = await _dbContext.WebPushSubscriptions
            .FirstOrDefaultAsync(x => x.Endpoint == normalizedEndpoint, cancellationToken);

        if (subscription is null)
        {
            _dbContext.WebPushSubscriptions.Add(new WebPushSubscription
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Endpoint = normalizedEndpoint,
                P256Dh = p256Dh.Trim(),
                Auth = auth.Trim(),
                UserAgent = NormalizeUserAgent(userAgent)
            });
        }
        else
        {
            subscription.UserId = userId;
            subscription.P256Dh = p256Dh.Trim();
            subscription.Auth = auth.Trim();
            subscription.UserAgent = NormalizeUserAgent(userAgent);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task RemoveSubscriptionAsync(Guid userId, string endpoint, CancellationToken cancellationToken = default)
    {
        var normalizedEndpoint = endpoint.Trim();
        var subscription = await _dbContext.WebPushSubscriptions
            .FirstOrDefaultAsync(x => x.UserId == userId && x.Endpoint == normalizedEndpoint, cancellationToken);

        if (subscription is null)
        {
            return;
        }

        _dbContext.WebPushSubscriptions.Remove(subscription);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task SendNotificationAsync(IEnumerable<Guid> userIds, string title, string body, string url, string tag, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
        {
            return;
        }

        var distinctUserIds = userIds
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToArray();

        if (distinctUserIds.Length == 0)
        {
            return;
        }

        var subscriptions = await _dbContext.WebPushSubscriptions
            .Where(x => distinctUserIds.Contains(x.UserId))
            .ToListAsync(cancellationToken);

        if (subscriptions.Count == 0)
        {
            return;
        }

        var vapidDetails = new VapidDetails(_options.Subject, _options.PublicKey, _options.PrivateKey);
        var payload = JsonSerializer.Serialize(new
        {
            title,
            body,
            url,
            tag
        }, JsonOptions);

        var now = DateTimeOffset.UtcNow;
        var staleSubscriptions = new List<WebPushSubscription>();

        foreach (var subscription in subscriptions)
        {
            try
            {
                await _client.SendNotificationAsync(
                    new PushSubscription(subscription.Endpoint, subscription.P256Dh, subscription.Auth),
                    payload,
                    vapidDetails);

                subscription.LastUsedAt = now;
            }
            catch (WebPushException ex) when ((int?)ex.StatusCode is 404 or 410)
            {
                staleSubscriptions.Add(subscription);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Web push delivery failed for subscription {SubscriptionId}", subscription.Id);
            }
        }

        if (staleSubscriptions.Count > 0)
        {
            _dbContext.WebPushSubscriptions.RemoveRange(staleSubscriptions);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string? NormalizeUserAgent(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
        {
            return null;
        }

        var trimmed = userAgent.Trim();
        return trimmed.Length <= 300 ? trimmed : trimmed[..300];
    }
}
