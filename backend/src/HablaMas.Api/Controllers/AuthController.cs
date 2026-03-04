using System.Security.Cryptography;
using System.Text;
using HablaMas.Api.Contracts.Auth;
using HablaMas.Api.Extensions;
using HablaMas.Application.DTOs;
using HablaMas.Application.Interfaces;
using HablaMas.Domain.Entities;
using HablaMas.Infrastructure.Data;
using HablaMas.Infrastructure.Options;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _dbContext;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IPasswordGenerator _passwordGenerator;
    private readonly IEmailService _emailService;
    private readonly JwtOptions _jwtOptions;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        UserManager<AppUser> userManager,
        AppDbContext dbContext,
        IJwtTokenService jwtTokenService,
        IPasswordGenerator passwordGenerator,
        IEmailService emailService,
        IOptions<JwtOptions> jwtOptions,
        IConfiguration configuration,
        ILogger<AuthController> logger)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _jwtTokenService = jwtTokenService;
        _passwordGenerator = passwordGenerator;
        _emailService = emailService;
        _jwtOptions = jwtOptions.Value;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var existing = await _userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            return Conflict(new ProblemDetails
            {
                Title = "Email already registered",
                Detail = "A user with this email already exists.",
                Status = StatusCodes.Status409Conflict
            });
        }

        var temporaryPassword = _passwordGenerator.GenerateTemporaryPassword();
        var publicCode = await GenerateUniquePublicCodeAsync();

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            UserName = email,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Address = request.Address.Trim(),
            PhoneNumber = request.Phone.Trim(),
            PublicAlias = string.IsNullOrWhiteSpace(request.PublicAlias) ? request.FirstName.Trim() : request.PublicAlias.Trim(),
            PublicCode = publicCode,
            EmailConfirmed = false,
            MustChangePassword = true,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var createResult = await _userManager.CreateAsync(user, temporaryPassword);
        if (!createResult.Succeeded)
        {
            return ValidationProblem(new ValidationProblemDetails(ToErrors(createResult)));
        }

        await _userManager.AddToRoleAsync(user, "User");

        var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
        var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
        var verifyUrl = BuildAbsoluteUrl($"/verify-email?userId={user.Id}&token={encodedToken}");

        var html = $@"
<h2>Bienvenido a Habla Mas</h2>
<p>Tu contrasena temporal es:</p>
<p><strong>{temporaryPassword}</strong></p>
<p>Debes verificar tu correo aqui:</p>
<p><a href='{verifyUrl}'>{verifyUrl}</a></p>
<p>Despues de iniciar sesion, se te pedira cambiar la contrasena.</p>";

        try
        {
            await _emailService.SendAsync(email, "Habla Mas - Verifica tu correo", html);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send verification email for user {UserId} ({Email}). Rolling back user creation.", user.Id, email);
            var deleteResult = await _userManager.DeleteAsync(user);
            if (!deleteResult.Succeeded)
            {
                _logger.LogError("Failed to rollback user {UserId} after email failure. Errors: {Errors}", user.Id, string.Join(", ", deleteResult.Errors.Select(e => e.Description)));
            }

            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Title = "Email service unavailable",
                Detail = "No se pudo enviar el correo de verificacion. Intenta nuevamente."
            });
        }

        return Ok(new
        {
            message = "User registered. Verify email and login with temporary password.",
            email,
            publicCode
        });
    }

    [HttpGet("verify-email")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyEmail([FromQuery] string userId, [FromQuery] string token)
    {
        if (!Guid.TryParse(userId, out var parsedUserId))
        {
            return BadRequest(new ProblemDetails { Title = "Invalid user id" });
        }

        var user = await _userManager.FindByIdAsync(parsedUserId.ToString());
        if (user is null)
        {
            return NotFound(new ProblemDetails { Title = "User not found" });
        }

        string decoded;
        try
        {
            decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
        }
        catch
        {
            return BadRequest(new ProblemDetails { Title = "Invalid token" });
        }

        var result = await _userManager.ConfirmEmailAsync(user, decoded);
        if (!result.Succeeded)
        {
            return BadRequest(new ProblemDetails { Title = "Email verification failed", Detail = string.Join(", ", result.Errors.Select(e => e.Description)) });
        }

        return Ok(new { message = "Email verified successfully." });
    }

    [HttpPost("resend-verification")]
    [AllowAnonymous]
    public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email.Trim().ToLowerInvariant());
        if (user is null)
        {
            return Ok(new { message = "If the account exists, a verification email has been sent." });
        }

        if (user.EmailConfirmed)
        {
            return Ok(new { message = "Email already confirmed." });
        }

        var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
        var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
        var verifyUrl = BuildAbsoluteUrl($"/verify-email?userId={user.Id}&token={encodedToken}");

        try
        {
            await _emailService.SendAsync(user.Email!, "Habla Mas - Verifica tu correo", $"<p>Verifica tu correo aqui: <a href='{verifyUrl}'>{verifyUrl}</a></p>");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to resend verification email for user {UserId}", user.Id);
            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails
            {
                Title = "Email delivery failed",
                Detail = "No se pudo enviar el correo de verificacion."
            });
        }

        return Ok(new { message = "Verification email sent." });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponseDto>> Login([FromBody] LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _userManager.Users.FirstOrDefaultAsync(x => x.Email == email);
        if (user is null)
        {
            return Unauthorized(new ProblemDetails { Title = "Invalid credentials" });
        }

        if (user.IsBlocked)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "User blocked" });
        }

        var validPassword = await _userManager.CheckPasswordAsync(user, request.Password);
        if (!validPassword)
        {
            return Unauthorized(new ProblemDetails { Title = "Invalid credentials" });
        }

        var roles = await _userManager.GetRolesAsync(user);
        var accessToken = _jwtTokenService.CreateAccessToken(user, roles);
        var refreshTokenValue = _jwtTokenService.CreateRefreshTokenValue();

        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(_jwtOptions.RefreshTokenDays)
        });

        user.LastLoginAt = DateTimeOffset.UtcNow;
        await _dbContext.SaveChangesAsync();

        return Ok(new AuthResponseDto
        {
            AccessToken = accessToken,
            RefreshToken = refreshTokenValue,
            MustChangePassword = user.MustChangePassword,
            EmailConfirmed = user.EmailConfirmed,
            UserId = user.Id.ToString(),
            Email = user.Email ?? string.Empty,
            PublicAlias = user.PublicAlias,
            Roles = roles.ToArray()
        });
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponseDto>> Refresh([FromBody] RefreshTokenRequest request)
    {
        var token = await _dbContext.RefreshTokens
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.Token == request.RefreshToken);

        if (token is null || token.RevokedAt.HasValue || token.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            return Unauthorized(new ProblemDetails { Title = "Invalid refresh token" });
        }

        var user = token.User;
        if (user.IsBlocked)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "User blocked" });
        }

        token.RevokedAt = DateTimeOffset.UtcNow;

        var roles = await _userManager.GetRolesAsync(user);
        var accessToken = _jwtTokenService.CreateAccessToken(user, roles);
        var refreshTokenValue = _jwtTokenService.CreateRefreshTokenValue();

        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(_jwtOptions.RefreshTokenDays)
        });

        await _dbContext.SaveChangesAsync();

        return Ok(new AuthResponseDto
        {
            AccessToken = accessToken,
            RefreshToken = refreshTokenValue,
            MustChangePassword = user.MustChangePassword,
            EmailConfirmed = user.EmailConfirmed,
            UserId = user.Id.ToString(),
            Email = user.Email ?? string.Empty,
            PublicAlias = user.PublicAlias,
            Roles = roles.ToArray()
        });
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email.Trim().ToLowerInvariant());
        if (user is null)
        {
            return Ok(new { message = "If the account exists, a reset link has been sent." });
        }

        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
        var resetUrl = BuildAbsoluteUrl($"/reset-password?email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(encodedToken)}");

        var html = $"<p>Haz clic para restablecer tu contrasena:</p><p><a href='{resetUrl}'>{resetUrl}</a></p>";
        try
        {
            await _emailService.SendAsync(user.Email!, "Habla Mas - Reset de contrasena", html);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send forgot-password email for user {UserId}", user.Id);
            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails
            {
                Title = "Email delivery failed",
                Detail = "No se pudo enviar el correo de recuperacion."
            });
        }

        return Ok(new { message = "If the account exists, a reset link has been sent." });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email.Trim().ToLowerInvariant());
        if (user is null)
        {
            return BadRequest(new ProblemDetails { Title = "Invalid token or email" });
        }

        string decoded;
        try
        {
            decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(request.Token));
        }
        catch
        {
            return BadRequest(new ProblemDetails { Title = "Invalid token" });
        }

        var result = await _userManager.ResetPasswordAsync(user, decoded, request.NewPassword);
        if (!result.Succeeded)
        {
            return ValidationProblem(new ValidationProblemDetails(ToErrors(result)));
        }

        user.MustChangePassword = false;
        await _userManager.UpdateAsync(user);

        return Ok(new { message = "Password reset successful." });
    }

    [HttpPost("change-temporary-password")]
    [Authorize]
    public async Task<IActionResult> ChangeTemporaryPassword([FromBody] ChangeTemporaryPasswordRequest request)
    {
        var userId = User.GetRequiredUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        var result = await _userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return ValidationProblem(new ValidationProblemDetails(ToErrors(result)));
        }

        user.MustChangePassword = false;
        await _userManager.UpdateAsync(user);

        return Ok(new { message = "Password changed successfully." });
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenRequest request)
    {
        var token = await _dbContext.RefreshTokens.FirstOrDefaultAsync(x => x.Token == request.RefreshToken);
        if (token is not null)
        {
            token.RevokedAt = DateTimeOffset.UtcNow;
            await _dbContext.SaveChangesAsync();
        }

        return Ok(new { message = "Logged out." });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = User.GetRequiredUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        var roles = await _userManager.GetRolesAsync(user);

        return Ok(new
        {
            id = user.Id,
            user.Email,
            user.FirstName,
            user.LastName,
            user.PublicAlias,
            user.PublicCode,
            user.Theme,
            user.AccentColor,
            user.EmailConfirmed,
            user.MustChangePassword,
            user.ProfileImageUrl,
            roles
        });
    }

    private async Task<string> GenerateUniquePublicCodeAsync()
    {
        while (true)
        {
            var bytes = RandomNumberGenerator.GetBytes(5);
            var suffix = Convert.ToHexString(bytes);
            var code = $"HM{suffix}";

            var exists = await _userManager.Users.AnyAsync(u => u.PublicCode == code);
            if (!exists)
            {
                return code;
            }
        }
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

    private static Dictionary<string, string[]> ToErrors(IdentityResult result)
    {
        return result.Errors
            .GroupBy(e => e.Code)
            .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray());
    }
}
