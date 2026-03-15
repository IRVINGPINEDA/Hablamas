using HablaMas.Api.Extensions;
using HablaMas.Api.Services;
using HablaMas.Domain.Entities;
using HablaMas.Domain.Enums;
using HablaMas.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace HablaMas.Api.Hubs;

[Authorize]
public sealed class ChatHub : Hub
{
    private readonly AppDbContext _dbContext;
    private readonly UserManager<AppUser> _userManager;
    private readonly PresenceTracker _presenceTracker;
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(
        AppDbContext dbContext,
        UserManager<AppUser> userManager,
        PresenceTracker presenceTracker,
        ILogger<ChatHub> logger)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _presenceTracker = presenceTracker;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.GetRequiredUserId() ?? Guid.Empty;
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user is null || user.IsBlocked || !user.EmailConfirmed || user.MustChangePassword)
        {
            Context.Abort();
            return;
        }

        var wentOnline = _presenceTracker.UserConnected(userId, Context.ConnectionId);
        if (wentOnline)
        {
            await Clients.All.SendAsync("presence:update", new { userId, online = true });
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_presenceTracker.UserDisconnected(Context.ConnectionId, out var userId))
        {
            await Clients.All.SendAsync("presence:update", new { userId, online = false });
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinConversation(Guid conversationId)
    {
        var userId = Context.User!.GetRequiredUserId();
        var conversation = await GetAuthorizedConversation(conversationId, userId);

        await Groups.AddToGroupAsync(Context.ConnectionId, conversation.Id.ToString());

        var pending = await _dbContext.MessageStatuses
            .Include(ms => ms.Message)
            .Where(ms => ms.RecipientId == userId
                         && ms.Status == MessageDeliveryStatus.Sent
                         && ms.Message.ConversationId == conversation.Id)
            .ToListAsync();

        if (pending.Count > 0)
        {
            foreach (var item in pending)
            {
                item.Status = MessageDeliveryStatus.Delivered;
                item.UpdatedAt = DateTimeOffset.UtcNow;
            }

            await _dbContext.SaveChangesAsync();
            await Clients.Group(conversation.Id.ToString()).SendAsync("message:status", new
            {
                conversationId = conversation.Id,
                status = MessageDeliveryStatus.Delivered.ToString(),
                recipientId = userId
            });
        }
    }

    public async Task SendText(Guid conversationId, string clientMessageId, string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        await SendMessageInternal(conversationId, clientMessageId, MessageType.Text, text.Trim(), null, null, null, null, null);
    }

    public async Task SendImage(Guid conversationId, string clientMessageId, string imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            return;
        }

        var normalizedUrl = imageUrl.Trim();
        await SendMessageInternal(conversationId, clientMessageId, MessageType.Image, null, normalizedUrl, normalizedUrl, null, null, null);
    }

    public async Task SendAttachment(
        Guid conversationId,
        string clientMessageId,
        string type,
        string attachmentUrl,
        string? attachmentName,
        string? attachmentContentType,
        long? attachmentSizeBytes)
    {
        if (string.IsNullOrWhiteSpace(type) || string.IsNullOrWhiteSpace(attachmentUrl))
        {
            return;
        }

        var messageType = type.Trim().ToLowerInvariant() switch
        {
            "image" => MessageType.Image,
            "video" => MessageType.Video,
            "file" => MessageType.File,
            "audio" => MessageType.Audio,
            _ => throw new HubException("Unsupported attachment type")
        };

        var normalizedUrl = attachmentUrl.Trim();
        await SendMessageInternal(
            conversationId,
            clientMessageId,
            messageType,
            null,
            messageType == MessageType.Image ? normalizedUrl : null,
            normalizedUrl,
            string.IsNullOrWhiteSpace(attachmentName) ? null : attachmentName.Trim(),
            string.IsNullOrWhiteSpace(attachmentContentType) ? null : attachmentContentType.Trim(),
            attachmentSizeBytes);
    }

    public async Task SendTyping(Guid conversationId, bool isTyping)
    {
        var userId = Context.User!.GetRequiredUserId();
        await GetAuthorizedConversation(conversationId, userId);

        await Clients.OthersInGroup(conversationId.ToString()).SendAsync("typing:update", new
        {
            conversationId,
            userId,
            isTyping
        });
    }

    public async Task MarkSeen(Guid conversationId, Guid? lastSeenMessageId)
    {
        var userId = Context.User!.GetRequiredUserId();
        var conversation = await GetAuthorizedConversation(conversationId, userId);

        DateTimeOffset? limit = null;
        if (lastSeenMessageId.HasValue)
        {
            limit = await _dbContext.Messages
                .Where(m => m.Id == lastSeenMessageId.Value && m.ConversationId == conversationId)
                .Select(m => (DateTimeOffset?)m.CreatedAt)
                .FirstOrDefaultAsync();
        }

        var query = _dbContext.MessageStatuses
            .Include(ms => ms.Message)
            .Where(ms => ms.RecipientId == userId
                         && ms.Message.ConversationId == conversationId
                         && ms.Status != MessageDeliveryStatus.Seen);

        if (limit.HasValue)
        {
            query = query.Where(ms => ms.Message.CreatedAt <= limit.Value);
        }

        var statuses = await query.ToListAsync();
        if (statuses.Count == 0)
        {
            return;
        }

        foreach (var status in statuses)
        {
            status.Status = MessageDeliveryStatus.Seen;
            status.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _dbContext.SaveChangesAsync();

        await Clients.Group(conversationId.ToString()).SendAsync("message:status", new
        {
            conversationId,
            status = MessageDeliveryStatus.Seen.ToString(),
            recipientId = userId,
            lastSeenMessageId
        });
    }

    private async Task<Conversation> GetAuthorizedConversation(Guid conversationId, Guid userId)
    {
        var conversation = await _dbContext.Conversations
            .FirstOrDefaultAsync(c => c.Id == conversationId);

        if (conversation is null || (conversation.UserAId != userId && conversation.UserBId != userId))
        {
            throw new HubException("Conversation not found");
        }

        return conversation;
    }

    private async Task SendMessageInternal(
        Guid conversationId,
        string? clientMessageId,
        MessageType type,
        string? text,
        string? imageUrl,
        string? attachmentUrl,
        string? attachmentName,
        string? attachmentContentType,
        long? attachmentSizeBytes)
    {
        var senderId = Context.User!.GetRequiredUserId();
        var conversation = await GetAuthorizedConversation(conversationId, senderId);

        var recipientId = conversation.UserAId == senderId ? conversation.UserBId : conversation.UserAId;

        var message = new Message
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            SenderId = senderId,
            Type = type,
            Text = text,
            ImageUrl = imageUrl,
            AttachmentUrl = type == MessageType.Text ? null : attachmentUrl,
            AttachmentName = type == MessageType.Text ? null : attachmentName,
            AttachmentContentType = type == MessageType.Text ? null : attachmentContentType,
            AttachmentSizeBytes = type == MessageType.Text ? null : attachmentSizeBytes,
            CreatedAt = DateTimeOffset.UtcNow,
            ClientMessageId = string.IsNullOrWhiteSpace(clientMessageId) ? null : clientMessageId
        };

        var status = new MessageStatus
        {
            Id = Guid.NewGuid(),
            MessageId = message.Id,
            RecipientId = recipientId,
            Status = MessageDeliveryStatus.Sent,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        conversation.LastMessageAt = message.CreatedAt;
        _dbContext.Messages.Add(message);
        _dbContext.MessageStatuses.Add(status);

        await _dbContext.SaveChangesAsync();

        var payload = new
        {
            conversationId = conversation.Id,
            message = new
            {
                id = message.Id,
                message.ConversationId,
                message.SenderId,
                message.Text,
                type = message.Type.ToString().ToLowerInvariant(),
                message.ImageUrl,
                message.AttachmentUrl,
                message.AttachmentName,
                message.AttachmentContentType,
                message.AttachmentSizeBytes,
                message.CreatedAt,
                message.ClientMessageId
            }
        };

        await Clients.Group(conversation.Id.ToString()).SendAsync("message:new", payload);
        await Clients.User(recipientId.ToString()).SendAsync("message:new", payload);

        if (_presenceTracker.IsOnline(recipientId))
        {
            status.Status = MessageDeliveryStatus.Delivered;
            status.UpdatedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();

            await Clients.Group(conversation.Id.ToString()).SendAsync("message:status", new
            {
                conversationId = conversation.Id,
                messageId = message.Id,
                status = MessageDeliveryStatus.Delivered.ToString(),
                recipientId
            });
        }

        _logger.LogDebug("Message {MessageId} sent in conversation {ConversationId}", message.Id, conversation.Id);
    }
}
