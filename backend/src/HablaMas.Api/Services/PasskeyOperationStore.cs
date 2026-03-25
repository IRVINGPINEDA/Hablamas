using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using StackExchange.Redis;

namespace HablaMas.Api.Services;

public sealed class PasskeyOperationStore : IPasskeyOperationStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IMemoryCache _memoryCache;
    private readonly IConnectionMultiplexer? _redis;

    public PasskeyOperationStore(IMemoryCache memoryCache, IConnectionMultiplexer? redis = null)
    {
        _memoryCache = memoryCache;
        _redis = redis;
    }

    public async Task StoreAsync<T>(string operationId, T payload, TimeSpan ttl, CancellationToken cancellationToken = default)
    {
        var key = BuildKey(operationId);
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        _memoryCache.Set(key, json, ttl);

        if (_redis is null)
        {
            return;
        }

        await _redis.GetDatabase().StringSetAsync(key, json, ttl).WaitAsync(cancellationToken);
    }

    public async Task<T?> TakeAsync<T>(string operationId, CancellationToken cancellationToken = default)
    {
        var key = BuildKey(operationId);
        string? json = null;

        if (_redis is not null)
        {
            var value = await _redis.GetDatabase().StringGetAsync(key).WaitAsync(cancellationToken);
            if (value.HasValue)
            {
                json = value!;
                await _redis.GetDatabase().KeyDeleteAsync(key).WaitAsync(cancellationToken);
            }
        }

        if (json is null && _memoryCache.TryGetValue<string>(key, out var cached))
        {
            json = cached;
        }

        _memoryCache.Remove(key);
        return json is null ? default : JsonSerializer.Deserialize<T>(json, JsonOptions);
    }

    private static string BuildKey(string operationId) => $"passkeys:op:{operationId}";
}
