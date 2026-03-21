namespace HablaMas.Api.Contracts.Notifications;

public sealed class PushSubscriptionRequest
{
    public string Endpoint { get; set; } = string.Empty;
    public PushSubscriptionKeysRequest Keys { get; set; } = new();
}

public sealed class PushSubscriptionKeysRequest
{
    public string P256Dh { get; set; } = string.Empty;
    public string Auth { get; set; } = string.Empty;
}
