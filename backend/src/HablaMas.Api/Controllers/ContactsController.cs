using HablaMas.Api.Contracts.Contacts;
using HablaMas.Api.Extensions;
using HablaMas.Application;
using HablaMas.Domain.Entities;
using HablaMas.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/contacts")]
[Authorize]
public sealed class ContactsController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public ContactsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
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

        var contacts = await _dbContext.Contacts
            .Where(c => c.OwnerUserId == userId)
            .Include(c => c.ContactUser)
            .OrderBy(c => c.ContactUser.PublicAlias)
            .ToListAsync();

        return Ok(contacts.Select(c => new
        {
            id = c.Id,
            alias = c.Alias,
            contactUser = new
            {
                id = c.ContactUser.Id,
                c.ContactUser.PublicAlias,
                c.ContactUser.PublicCode,
                c.ContactUser.ProfileImageUrl,
                c.ContactUser.Bio,
                c.ContactUser.EmailConfirmed
            }
        }));
    }

    [HttpPost("add-by-code")]
    public async Task<IActionResult> AddByCode([FromBody] AddContactByCodeRequest request)
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var normalizedCode = request.PublicCode.Trim().ToUpperInvariant();

        var target = await _dbContext.Users.FirstOrDefaultAsync(u => u.PublicCode == normalizedCode);
        if (target is null)
        {
            return NotFound(new ProblemDetails { Title = "Public code not found" });
        }

        if (target.Id == userId)
        {
            return BadRequest(new ProblemDetails { Title = "You cannot add yourself" });
        }

        var existing = await _dbContext.Contacts
            .FirstOrDefaultAsync(c => c.OwnerUserId == userId && c.ContactUserId == target.Id);

        if (existing is null)
        {
            _dbContext.Contacts.Add(new Contact
            {
                Id = Guid.NewGuid(),
                OwnerUserId = userId,
                ContactUserId = target.Id,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        var reverse = await _dbContext.Contacts
            .FirstOrDefaultAsync(c => c.OwnerUserId == target.Id && c.ContactUserId == userId);

        if (reverse is null)
        {
            _dbContext.Contacts.Add(new Contact
            {
                Id = Guid.NewGuid(),
                OwnerUserId = target.Id,
                ContactUserId = userId,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        var (a, b) = ConversationPairHelper.Sort(userId, target.Id);
        var conversation = await _dbContext.Conversations.FirstOrDefaultAsync(c => c.UserAId == a && c.UserBId == b);
        if (conversation is null)
        {
            conversation = new Conversation
            {
                Id = Guid.NewGuid(),
                UserAId = a,
                UserBId = b,
                CreatedAt = DateTimeOffset.UtcNow
            };
            _dbContext.Conversations.Add(conversation);
        }

        await _dbContext.SaveChangesAsync();

        return Ok(new
        {
            message = "Contact added",
            conversationId = conversation.Id,
            contact = new
            {
                id = target.Id,
                target.PublicAlias,
                target.PublicCode,
                target.ProfileImageUrl,
                target.Bio
            }
        });
    }

    [HttpPatch("{contactId:guid}/alias")]
    public async Task<IActionResult> UpdateAlias(Guid contactId, [FromBody] UpdateAliasRequest request)
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        var contact = await _dbContext.Contacts
            .Include(c => c.ContactUser)
            .FirstOrDefaultAsync(c => c.Id == contactId && c.OwnerUserId == userId);

        if (contact is null)
        {
            return NotFound(new ProblemDetails { Title = "Contact not found" });
        }

        contact.Alias = string.IsNullOrWhiteSpace(request.Alias) ? null : request.Alias.Trim();
        await _dbContext.SaveChangesAsync();

        return Ok(new { message = "Alias updated", contactId = contact.Id, alias = contact.Alias });
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
