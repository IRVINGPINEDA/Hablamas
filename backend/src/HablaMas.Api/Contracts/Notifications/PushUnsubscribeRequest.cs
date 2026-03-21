namespace HablaMas.Api.Contracts.Notifications;

public sealed class PushUnsubscribeRequest
{
    public string Endpoint { get; set; } = string.Empty;
}
