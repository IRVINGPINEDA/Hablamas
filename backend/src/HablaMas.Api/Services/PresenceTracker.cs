using System.Collections.Concurrent;

namespace HablaMas.Api.Services;

public sealed class PresenceTracker
{
    private readonly ConcurrentDictionary<Guid, int> _onlineUsers = new();
    private readonly ConcurrentDictionary<string, Guid> _connections = new();

    public bool UserConnected(Guid userId, string connectionId)
    {
        _connections[connectionId] = userId;
        var total = _onlineUsers.AddOrUpdate(userId, 1, (_, current) => current + 1);
        return total == 1;
    }

    public bool UserDisconnected(string connectionId, out Guid userId)
    {
        userId = Guid.Empty;
        if (!_connections.TryRemove(connectionId, out var existingUserId))
        {
            return false;
        }

        userId = existingUserId;

        if (_onlineUsers.TryGetValue(existingUserId, out var count))
        {
            if (count <= 1)
            {
                _onlineUsers.TryRemove(existingUserId, out _);
                return true;
            }

            _onlineUsers[existingUserId] = count - 1;
        }

        return false;
    }

    public bool IsOnline(Guid userId) => _onlineUsers.ContainsKey(userId);
}
