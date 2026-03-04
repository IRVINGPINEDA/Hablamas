using System.Text;
using System.Text.Json;
using HablaMas.Api.Contracts.Admin;
using HablaMas.Application.Interfaces;
using HablaMas.Domain.Entities;
using HablaMas.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(Roles = "Admin")]
public sealed class AdminController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly UserManager<AppUser> _userManager;
    private readonly RoleManager<AppRole> _roleManager;
    private readonly IPasswordGenerator _passwordGenerator;
    private readonly IEmailService _emailService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        AppDbContext dbContext,
        UserManager<AppUser> userManager,
        RoleManager<AppRole> roleManager,
        IPasswordGenerator passwordGenerator,
        IEmailService emailService,
        IConfiguration configuration,
        ILogger<AdminController> logger)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _roleManager = roleManager;
        _passwordGenerator = passwordGenerator;
        _emailService = emailService;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> ListUsers([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? search = null)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _dbContext.Users.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(u =>
                (u.Email ?? string.Empty).ToLower().Contains(term) ||
                u.FirstName.ToLower().Contains(term) ||
                u.LastName.ToLower().Contains(term) ||
                u.PublicAlias.ToLower().Contains(term) ||
                u.PublicCode.ToLower().Contains(term));
        }

        var total = await query.CountAsync();
        var users = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new
        {
            page,
            pageSize,
            total,
            items = users.Select(u => new
            {
                id = u.Id,
                u.FirstName,
                u.LastName,
                u.Email,
                phone = u.PhoneNumber,
                u.PublicAlias,
                u.PublicCode,
                u.EmailConfirmed,
                u.IsBlocked,
                u.CreatedAt,
                u.LastLoginAt
            })
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetUser(Guid id)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id);
        if (user is null)
        {
            return NotFound();
        }

        var roles = await _userManager.GetRolesAsync(user);

        return Ok(new
        {
            user.Id,
            user.FirstName,
            user.LastName,
            user.Email,
            phone = user.PhoneNumber,
            user.Address,
            user.Bio,
            user.PublicAlias,
            user.PublicCode,
            user.ProfileImageUrl,
            user.EmailConfirmed,
            user.MustChangePassword,
            user.IsBlocked,
            user.CreatedAt,
            user.LastLoginAt,
            roles
        });
    }

    [HttpPost("{id:guid}/block")]
    public async Task<IActionResult> BlockUser(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        user.IsBlocked = true;
        await _userManager.UpdateAsync(user);
        await AuditAsync("block", user.Id, new { });

        return Ok(new { message = "User blocked" });
    }

    [HttpPost("{id:guid}/unblock")]
    public async Task<IActionResult> UnblockUser(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        user.IsBlocked = false;
        await _userManager.UpdateAsync(user);
        await AuditAsync("unblock", user.Id, new { });

        return Ok(new { message = "User unblocked" });
    }

    [HttpPost("{id:guid}/force-reset-password")]
    public async Task<IActionResult> ForceResetPassword(Guid id, [FromBody] ForceResetPasswordRequest? request)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        var sendEmail = request?.SendEmail ?? true;
        var temporaryPassword = _passwordGenerator.GenerateTemporaryPassword();
        var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);
        var resetResult = await _userManager.ResetPasswordAsync(user, resetToken, temporaryPassword);

        if (!resetResult.Succeeded)
        {
            return ValidationProblem(new ValidationProblemDetails(resetResult.Errors
                .GroupBy(e => e.Code)
                .ToDictionary(g => g.Key, g => g.Select(x => x.Description).ToArray())));
        }

        user.MustChangePassword = true;
        await _userManager.UpdateAsync(user);

        var emailFailed = false;
        if (sendEmail && !string.IsNullOrWhiteSpace(user.Email))
        {
            try
            {
                await _emailService.SendAsync(
                    user.Email!,
                    "Habla Mas - Reset forzado",
                    $"<p>Tu nueva contrasena temporal es:</p><p><strong>{temporaryPassword}</strong></p><p>Debes cambiarla al iniciar sesion.</p>");
            }
            catch (Exception ex)
            {
                emailFailed = true;
                _logger.LogError(ex, "Failed to send force-reset password email to user {UserId}", user.Id);
            }
        }

        await AuditAsync("force-reset-password", user.Id, new { sendEmail, emailFailed });

        return Ok(new
        {
            message = emailFailed
                ? "Temporary password generated. Email delivery failed; share it manually."
                : sendEmail
                ? "Temporary password generated, shown once, and emailed."
                : "Temporary password generated and shown once.",
            temporaryPassword,
            sendEmail,
            emailFailed
        });
    }

    [HttpPost("{id:guid}/resend-verification")]
    public async Task<IActionResult> ResendVerification(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        if (user.EmailConfirmed)
        {
            return Ok(new { message = "Email already confirmed" });
        }

        var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
        var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
        var verifyUrl = BuildAbsoluteUrl($"/verify-email?userId={user.Id}&token={encodedToken}");

        try
        {
            await _emailService.SendAsync(user.Email!, "Habla Mas - Verificacion", $"<p>Verifica tu cuenta aqui: <a href='{verifyUrl}'>{verifyUrl}</a></p>");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to resend verification email from admin for user {UserId}", user.Id);
            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails
            {
                Title = "Email delivery failed",
                Detail = "No se pudo enviar el correo de verificacion."
            });
        }

        await AuditAsync("resend-verification", user.Id, new { });

        return Ok(new { message = "Verification email sent" });
    }

    [HttpPost("{id:guid}/set-role")]
    public async Task<IActionResult> SetRole(Guid id, [FromBody] SetRoleRequest request)
    {
        var normalizedRole = request.Role.Trim();
        if (normalizedRole is not ("User" or "Admin"))
        {
            return BadRequest(new ProblemDetails { Title = "Role must be User or Admin" });
        }

        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        if (!await _roleManager.RoleExistsAsync(normalizedRole))
        {
            await _roleManager.CreateAsync(new AppRole { Name = normalizedRole, NormalizedName = normalizedRole.ToUpperInvariant() });
        }

        var currentRoles = await _userManager.GetRolesAsync(user);
        if (currentRoles.Count > 0)
        {
            await _userManager.RemoveFromRolesAsync(user, currentRoles);
        }

        await _userManager.AddToRoleAsync(user, normalizedRole);
        await AuditAsync("set-role", user.Id, new { role = normalizedRole });

        return Ok(new { message = "Role updated", role = normalizedRole });
    }

    private string BuildAbsoluteUrl(string relative)
    {
        var baseUrl = _configuration["APP_BASE_URL"]?.TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(baseUrl))
        {
            return $"{baseUrl}{relative}";
        }

        return $"{Request.Scheme}://{Request.Host}{relative}";
    }

    private async Task AuditAsync(string action, Guid targetUserId, object metadata)
    {
        var adminIdRaw = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(adminIdRaw, out var adminId))
        {
            return;
        }

        _dbContext.AdminAuditLogs.Add(new AdminAuditLog
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminId,
            Action = action,
            TargetUserId = targetUserId,
            MetadataJson = JsonSerializer.Serialize(metadata),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await _dbContext.SaveChangesAsync();
    }
}
