using HablaMas.Api.Contracts.Chat;
using HablaMas.Api.Extensions;
using HablaMas.Domain.Enums;
using HablaMas.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/chats")]
[Authorize]
public sealed class ChatsController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public ChatsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<IActionResult> GetChats()
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var conversations = await _dbContext.Conversations
            .Where(c => c.UserAId == userId || c.UserBId == userId)
            .Include(c => c.UserA)
            .Include(c => c.UserB)
            .OrderByDescending(c => c.LastMessageAt ?? c.CreatedAt)
            .ToListAsync();

        var conversationIds = conversations.Select(c => c.Id).ToArray();

        var messages = await _dbContext.Messages
            .Where(m => conversationIds.Contains(m.ConversationId))
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();

        var lastByConversation = messages
            .GroupBy(m => m.ConversationId)
            .ToDictionary(g => g.Key, g => g.First());

        var aliases = await _dbContext.Contacts
            .Where(c => c.OwnerUserId == userId)
            .ToDictionaryAsync(c => c.ContactUserId, c => c.Alias);

        var data = conversations.Select(c =>
        {
            var other = c.UserAId == userId ? c.UserB : c.UserA;
            aliases.TryGetValue(other.Id, out var alias);
            lastByConversation.TryGetValue(c.Id, out var last);

            return new
            {
                id = c.Id,
                createdAt = c.CreatedAt,
                lastMessageAt = c.LastMessageAt,
                contact = new
                {
                    id = other.Id,
                    publicAlias = other.PublicAlias,
                    alias,
                    other.PublicCode,
                    other.ProfileImageUrl
                },
                lastMessage = last is null ? null : new
                {
                    id = last.Id,
                    text = last.Text,
                    type = last.Type.ToString().ToLowerInvariant(),
                    last.ImageUrl,
                    last.AttachmentUrl,
                    last.AttachmentName,
                    last.AttachmentContentType,
                    last.AttachmentSizeBytes,
                    last.SenderId,
                    last.CreatedAt
                }
            };
        });

        return Ok(data);
    }

    [HttpGet("{conversationId:guid}/messages")]
    public async Task<IActionResult> GetMessages(Guid conversationId, [FromQuery] int page = 1, [FromQuery] int pageSize = 30)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var conversation = await _dbContext.Conversations.FirstOrDefaultAsync(c => c.Id == conversationId);
        if (conversation is null || (conversation.UserAId != userId && conversation.UserBId != userId))
        {
            return NotFound(new ProblemDetails { Title = "Conversation not found" });
        }

        var total = await _dbContext.Messages.CountAsync(m => m.ConversationId == conversationId);

        var messages = await _dbContext.Messages
            .Where(m => m.ConversationId == conversationId)
            .Include(m => m.Sender)
            .OrderByDescending(m => m.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var messageIds = messages.Select(m => m.Id).ToArray();
        var statuses = await _dbContext.MessageStatuses
            .Where(ms => messageIds.Contains(ms.MessageId) && ms.RecipientId == userId)
            .ToDictionaryAsync(ms => ms.MessageId, ms => ms.Status.ToString());

        var items = messages
            .OrderBy(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id,
                m.ConversationId,
                m.SenderId,
                senderAlias = m.Sender.PublicAlias,
                m.Text,
                type = m.Type.ToString().ToLowerInvariant(),
                m.ImageUrl,
                m.AttachmentUrl,
                m.AttachmentName,
                m.AttachmentContentType,
                m.AttachmentSizeBytes,
                m.CreatedAt,
                status = statuses.TryGetValue(m.Id, out var s) ? s : (m.SenderId == userId ? MessageDeliveryStatus.Delivered.ToString() : MessageDeliveryStatus.Sent.ToString())
            });

        return Ok(new
        {
            page,
            pageSize,
            total,
            items
        });
    }

    [HttpPost("{conversationId:guid}/mark-seen")]
    public async Task<IActionResult> MarkSeen(Guid conversationId, [FromBody] MarkSeenRequest request)
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var conversation = await _dbContext.Conversations.FirstOrDefaultAsync(c => c.Id == conversationId);
        if (conversation is null || (conversation.UserAId != userId && conversation.UserBId != userId))
        {
            return NotFound(new ProblemDetails { Title = "Conversation not found" });
        }

        DateTimeOffset? limit = null;
        if (request.LastSeenMessageId.HasValue)
        {
            limit = await _dbContext.Messages
                .Where(m => m.Id == request.LastSeenMessageId.Value && m.ConversationId == conversationId)
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
        foreach (var status in statuses)
        {
            status.Status = MessageDeliveryStatus.Seen;
            status.UpdatedAt = DateTimeOffset.UtcNow;
        }

        await _dbContext.SaveChangesAsync();

        return Ok(new { updated = statuses.Count });
    }

    private async Task<IActionResult?> EnsureCanChatAsync(Guid userId)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.IsBlocked)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "User blocked" });
        }

        if (!user.EmailConfirmed)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "Email not confirmed" });
        }

        if (user.MustChangePassword)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "Password change required" });
        }

        return null;
    }
}
