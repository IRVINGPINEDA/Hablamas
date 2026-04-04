using Microsoft.Extensions.Caching.Memory;

namespace HablaMas.Api.Services;

public sealed class PasskeyOperationStore
{
    private static readonly TimeSpan Expiration = TimeSpan.FromMinutes(5);
    private readonly IMemoryCache _cache;

    public PasskeyOperationStore(IMemoryCache cache)
    {
        _cache = cache;
    }

    public void SetRegistrationOptions(Guid userId, string optionsJson)
    {
        _cache.Set(GetRegistrationKey(userId), optionsJson, Expiration);
    }

    public string? TakeRegistrationOptions(Guid userId)
    {
        var key = GetRegistrationKey(userId);
        if (!_cache.TryGetValue<string>(key, out var optionsJson))
        {
            return null;
        }

        _cache.Remove(key);
        return optionsJson;
    }

    public string SetAuthenticationOptions(Guid userId, string email, string optionsJson)
    {
        var operationId = Guid.NewGuid().ToString("N");
        _cache.Set(GetAuthenticationKey(operationId), new PendingAuthenticationOperation
        {
            UserId = userId,
            Email = email,
            OptionsJson = optionsJson
        }, Expiration);

        return operationId;
    }

    public PendingAuthenticationOperation? TakeAuthenticationOptions(string operationId)
    {
        var key = GetAuthenticationKey(operationId);
        if (!_cache.TryGetValue<PendingAuthenticationOperation>(key, out var operation))
        {
            return null;
        }

        _cache.Remove(key);
        return operation;
    }

    private static string GetRegistrationKey(Guid userId) => $"passkeys:register:{userId:N}";

    private static string GetAuthenticationKey(string operationId) => $"passkeys:auth:{operationId}";
}

public sealed class PendingAuthenticationOperation
{
    public Guid UserId { get; init; }
    public string Email { get; init; } = string.Empty;
    public string OptionsJson { get; init; } = string.Empty;
}
