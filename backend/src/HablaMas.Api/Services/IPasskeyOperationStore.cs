namespace HablaMas.Api.Services;

public interface IPasskeyOperationStore
{
    Task StoreAsync<T>(string operationId, T payload, TimeSpan ttl, CancellationToken cancellationToken = default);
    Task<T?> TakeAsync<T>(string operationId, CancellationToken cancellationToken = default);
}
