using System.Collections.Concurrent;
using System.Text.Json;
using AppMovilHablamas.Models;
using Microsoft.AspNetCore.SignalR.Client;

namespace AppMovilHablamas.Services;

public sealed class ChatRealtimeService
{
    private readonly AppSession _session;
    private readonly ConcurrentDictionary<Guid, bool> _presence = new();
    private HubConnection? _connection;

    public ChatRealtimeService(AppSession session)
    {
        _session = session;
        _session.SessionChanged += async (_, _) =>
        {
            if (!_session.IsAuthenticated)
            {
                await DisconnectAsync();
            }
        };
    }

    public event EventHandler<HubMessageEnvelopeDto>? MessageReceived;
    public event EventHandler<HubStatusDto>? StatusUpdated;
    public event EventHandler<HubTypingDto>? TypingUpdated;
    public event EventHandler<HubPresenceDto>? PresenceUpdated;

    public bool IsOnline(Guid userId) => _presence.TryGetValue(userId, out var online) && online;

    public async Task EnsureConnectedAsync(CancellationToken cancellationToken = default)
    {
        if (_connection is null)
        {
            _connection = BuildConnection();
        }

        if (_connection.State is HubConnectionState.Connected or HubConnectionState.Connecting or HubConnectionState.Reconnecting)
        {
            return;
        }

        await _connection.StartAsync(cancellationToken);
    }

    public async Task JoinConversationAsync(Guid conversationId, CancellationToken cancellationToken = default)
    {
        await EnsureConnectedAsync(cancellationToken);
        await _connection!.InvokeAsync("JoinConversation", conversationId, cancellationToken);
    }

    public async Task SendTextAsync(Guid conversationId, string text, CancellationToken cancellationToken = default)
    {
        await EnsureConnectedAsync(cancellationToken);
        await _connection!.InvokeAsync("SendText", conversationId, Guid.NewGuid().ToString(), text, cancellationToken);
    }

    public async Task SendImageAsync(Guid conversationId, string imageUrl, CancellationToken cancellationToken = default)
    {
        await EnsureConnectedAsync(cancellationToken);
        await _connection!.InvokeAsync("SendImage", conversationId, Guid.NewGuid().ToString(), imageUrl, cancellationToken);
    }

    public async Task SendTypingAsync(Guid conversationId, bool isTyping, CancellationToken cancellationToken = default)
    {
        await EnsureConnectedAsync(cancellationToken);
        await _connection!.InvokeAsync("SendTyping", conversationId, isTyping, cancellationToken);
    }

    public async Task MarkSeenAsync(Guid conversationId, Guid? lastSeenMessageId, CancellationToken cancellationToken = default)
    {
        await EnsureConnectedAsync(cancellationToken);
        await _connection!.InvokeAsync("MarkSeen", conversationId, lastSeenMessageId, cancellationToken);
    }

    public async Task DisconnectAsync()
    {
        if (_connection is null)
        {
            return;
        }

        if (_connection.State != HubConnectionState.Disconnected)
        {
            await _connection.StopAsync();
        }

        await _connection.DisposeAsync();
        _connection = null;
    }

    private HubConnection BuildConnection()
    {
        var connection = new HubConnectionBuilder()
            .WithUrl(_session.HubUrl, options =>
            {
                options.AccessTokenProvider = () => Task.FromResult(_session.AccessToken);
            })
            .WithAutomaticReconnect()
            .Build();

        connection.On<JsonElement>("message:new", payload =>
        {
            var envelope = payload.Deserialize<HubMessageEnvelopeDto>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (envelope is not null)
            {
                MessageReceived?.Invoke(this, envelope);
            }
        });

        connection.On<JsonElement>("message:status", payload =>
        {
            var status = payload.Deserialize<HubStatusDto>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (status is not null)
            {
                StatusUpdated?.Invoke(this, status);
            }
        });

        connection.On<JsonElement>("typing:update", payload =>
        {
            var typing = payload.Deserialize<HubTypingDto>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (typing is not null)
            {
                TypingUpdated?.Invoke(this, typing);
            }
        });

        connection.On<JsonElement>("presence:update", payload =>
        {
            var presence = payload.Deserialize<HubPresenceDto>(new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if (presence is null)
            {
                return;
            }

            _presence[presence.UserId] = presence.Online;
            PresenceUpdated?.Invoke(this, presence);
        });

        return connection;
    }
}
