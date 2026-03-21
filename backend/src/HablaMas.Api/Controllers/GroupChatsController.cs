using HablaMas.Api.Contracts.GroupChats;
using HablaMas.Api.Extensions;
using HablaMas.Api.Services;
using HablaMas.Domain.Entities;
using HablaMas.Domain.Enums;
using HablaMas.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/group-chats")]
[Authorize]
public sealed class GroupChatsController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly PresenceTracker _presenceTracker;
    private readonly IWebPushService _webPushService;

    public GroupChatsController(AppDbContext dbContext, PresenceTracker presenceTracker, IWebPushService webPushService)
    {
        _dbContext = dbContext;
        _presenceTracker = presenceTracker;
        _webPushService = webPushService;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var groups = await _dbContext.GroupChats
            .AsNoTracking()
            .Where(g => g.Members.Any(m => m.UserId == userId))
            .Include(g => g.Members)
            .OrderByDescending(g => g.LastMessageAt ?? g.CreatedAt)
            .ToListAsync();

        var groupIds = groups.Select(g => g.Id).ToArray();
        var lastMessages = await _dbContext.GroupChatMessages
            .AsNoTracking()
            .Where(m => groupIds.Contains(m.GroupChatId))
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();

        var lastByGroup = lastMessages
            .GroupBy(m => m.GroupChatId)
            .ToDictionary(g => g.Key, g => g.First());

        return Ok(groups.Select(group =>
        {
            lastByGroup.TryGetValue(group.Id, out var last);
            return new
            {
                id = group.Id,
                group.Name,
                group.CreatedAt,
                group.LastMessageAt,
                memberCount = group.Members.Count,
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
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateGroupChatRequest request)
    {
        var ownerId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(ownerId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var memberIds = request.MemberUserIds
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToHashSet();
        memberIds.Add(ownerId);

        if (memberIds.Count < 2)
        {
            return BadRequest(new ProblemDetails { Title = "A group requires at least 2 members." });
        }

        var existingUsers = await _dbContext.Users
            .Where(u => memberIds.Contains(u.Id))
            .Select(u => u.Id)
            .ToListAsync();

        if (existingUsers.Count != memberIds.Count)
        {
            return BadRequest(new ProblemDetails { Title = "One or more members do not exist." });
        }

        var now = DateTimeOffset.UtcNow;
        var group = new GroupChat
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            OwnerUserId = ownerId,
            CreatedAt = now
        };

        _dbContext.GroupChats.Add(group);
        _dbContext.GroupChatMembers.AddRange(memberIds.Select(userId => new GroupChatMember
        {
            GroupChatId = group.Id,
            UserId = userId,
            JoinedAt = now
        }));

        await _dbContext.SaveChangesAsync();

        return Ok(new
        {
            id = group.Id,
            group.Name,
            group.CreatedAt,
            memberCount = memberIds.Count
        });
    }

    [HttpGet("{groupId:guid}/members")]
    public async Task<IActionResult> Members(Guid groupId)
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var membership = await _dbContext.GroupChatMembers
            .AsNoTracking()
            .AnyAsync(m => m.GroupChatId == groupId && m.UserId == userId);
        if (!membership)
        {
            return NotFound(new ProblemDetails { Title = "Group not found" });
        }

        var members = await _dbContext.GroupChatMembers
            .AsNoTracking()
            .Where(m => m.GroupChatId == groupId)
            .Include(m => m.User)
            .OrderBy(m => m.User.PublicAlias)
            .ToListAsync();

        return Ok(members.Select(member => new
        {
            id = member.UserId,
            member.User.PublicAlias,
            member.User.PublicCode,
            member.User.ProfileImageUrl,
            member.JoinedAt
        }));
    }

    [HttpPost("{groupId:guid}/members")]
    public async Task<IActionResult> AddMember(Guid groupId, [FromBody] AddGroupChatMemberRequest request)
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var group = await _dbContext.GroupChats
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return NotFound(new ProblemDetails { Title = "Group not found" });
        }

        if (!group.Members.Any(m => m.UserId == userId))
        {
            return Forbid();
        }

        var targetUser = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == request.UserId);
        if (targetUser is null)
        {
            return NotFound(new ProblemDetails { Title = "User not found" });
        }

        if (group.Members.Any(m => m.UserId == request.UserId))
        {
            return Ok(new { message = "User already in group" });
        }

        _dbContext.GroupChatMembers.Add(new GroupChatMember
        {
            GroupChatId = group.Id,
            UserId = targetUser.Id,
            JoinedAt = DateTimeOffset.UtcNow
        });

        await _dbContext.SaveChangesAsync();
        return Ok(new { message = "Member added", userId = targetUser.Id });
    }

    [HttpGet("{groupId:guid}/messages")]
    public async Task<IActionResult> Messages(Guid groupId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var membership = await _dbContext.GroupChatMembers
            .AsNoTracking()
            .AnyAsync(m => m.GroupChatId == groupId && m.UserId == userId);
        if (!membership)
        {
            return NotFound(new ProblemDetails { Title = "Group not found" });
        }

        var total = await _dbContext.GroupChatMessages.CountAsync(m => m.GroupChatId == groupId);

        var messages = await _dbContext.GroupChatMessages
            .AsNoTracking()
            .Where(m => m.GroupChatId == groupId)
            .Include(m => m.Sender)
            .OrderByDescending(m => m.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var items = messages
            .OrderBy(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id,
                groupChatId = m.GroupChatId,
                m.SenderId,
                senderAlias = m.Sender.PublicAlias,
                m.Text,
                type = m.Type.ToString().ToLowerInvariant(),
                m.ImageUrl,
                m.AttachmentUrl,
                m.AttachmentName,
                m.AttachmentContentType,
                m.AttachmentSizeBytes,
                m.CreatedAt
            });

        return Ok(new
        {
            page,
            pageSize,
            total,
            items
        });
    }

    [HttpPost("{groupId:guid}/messages")]
    public async Task<IActionResult> SendMessage(Guid groupId, [FromBody] SendGroupChatMessageRequest request)
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var group = await _dbContext.GroupChats
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null || !group.Members.Any(m => m.UserId == userId))
        {
            return NotFound(new ProblemDetails { Title = "Group not found" });
        }

        var type = request.Type.Trim().ToLowerInvariant() switch
        {
            "image" => MessageType.Image,
            "video" => MessageType.Video,
            "file" => MessageType.File,
            "audio" => MessageType.Audio,
            _ => MessageType.Text
        };

        var text = request.Text?.Trim();
        var imageUrl = request.ImageUrl?.Trim();
        var attachmentUrl = request.AttachmentUrl?.Trim();
        var attachmentName = request.AttachmentName?.Trim();
        var attachmentContentType = request.AttachmentContentType?.Trim();
        if (type == MessageType.Text && string.IsNullOrWhiteSpace(text))
        {
            return BadRequest(new ProblemDetails { Title = "Text is required for text messages." });
        }

        if (type == MessageType.Image && string.IsNullOrWhiteSpace(imageUrl))
        {
            return BadRequest(new ProblemDetails { Title = "ImageUrl is required for image messages." });
        }

        if (type is MessageType.Video or MessageType.File or MessageType.Audio)
        {
            if (string.IsNullOrWhiteSpace(attachmentUrl))
            {
                return BadRequest(new ProblemDetails { Title = "AttachmentUrl is required for attachment messages." });
            }
        }

        var message = new GroupChatMessage
        {
            Id = Guid.NewGuid(),
            GroupChatId = group.Id,
            SenderId = userId,
            Type = type,
            Text = type == MessageType.Text ? text : null,
            ImageUrl = type == MessageType.Image ? imageUrl : null,
            AttachmentUrl = type == MessageType.Text ? null : (type == MessageType.Image ? imageUrl : attachmentUrl),
            AttachmentName = type == MessageType.Text ? null : attachmentName,
            AttachmentContentType = type == MessageType.Text ? null : attachmentContentType,
            AttachmentSizeBytes = type == MessageType.Text ? null : request.AttachmentSizeBytes,
            CreatedAt = DateTimeOffset.UtcNow,
            ClientMessageId = string.IsNullOrWhiteSpace(request.ClientMessageId) ? null : request.ClientMessageId.Trim()
        };

        group.LastMessageAt = message.CreatedAt;
        _dbContext.GroupChatMessages.Add(message);
        await _dbContext.SaveChangesAsync();

        var recipientIds = group.Members
            .Select(member => member.UserId)
            .Where(memberId => memberId != userId && !_presenceTracker.IsOnline(memberId))
            .Distinct()
            .ToArray();

        if (recipientIds.Length > 0)
        {
            var senderAlias = User.Identity?.Name ?? "Nuevo mensaje";
            await _webPushService.SendNotificationAsync(
                recipientIds,
                group.Name,
                $"{senderAlias}: {BuildMessagePreview(type, text, attachmentName)}",
                "/app",
                $"group:{group.Id}");
        }

        return Ok(new
        {
            id = message.Id,
            groupChatId = group.Id,
            message.SenderId,
            message.Text,
            type = message.Type.ToString().ToLowerInvariant(),
            message.ImageUrl,
            message.AttachmentUrl,
            message.AttachmentName,
            message.AttachmentContentType,
            message.AttachmentSizeBytes,
            message.CreatedAt
        });
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

    private static string BuildMessagePreview(MessageType type, string? text, string? attachmentName)
    {
        return type switch
        {
            MessageType.Text => string.IsNullOrWhiteSpace(text) ? "Hay un mensaje nuevo en el grupo." : text,
            MessageType.Image => "Envio una imagen.",
            MessageType.Video => "Envio un video.",
            MessageType.Audio => "Envio una nota de voz.",
            MessageType.File => string.IsNullOrWhiteSpace(attachmentName) ? "Envio un archivo." : $"Archivo: {attachmentName}",
            _ => "Hay un mensaje nuevo en el grupo."
        };
    }
}
