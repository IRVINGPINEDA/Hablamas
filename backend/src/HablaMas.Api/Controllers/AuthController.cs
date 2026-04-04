using System.Security.Cryptography;
using System.Text;
using HablaMas.Api.Contracts.Auth;
using HablaMas.Api.Extensions;
using HablaMas.Api.Services;
using HablaMas.Application.DTOs;
using HablaMas.Application.Interfaces;
using HablaMas.Domain.Entities;
using HablaMas.Infrastructure.Data;
using HablaMas.Infrastructure.Options;
using Fido2NetLib;
using Fido2NetLib.Objects;
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
    private static readonly HashSet<string> AllowedFaceImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp"
    };

    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _dbContext;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IPasswordGenerator _passwordGenerator;
    private readonly IEmailService _emailService;
    private readonly IEmailTemplateService _emailTemplateService;
    private readonly JwtOptions _jwtOptions;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthController> _logger;
    private readonly IFido2 _fido2;
    private readonly PasskeyOperationStore _passkeyOperationStore;
    private readonly IFileStorageService _fileStorageService;
    private readonly UploadOptions _uploadOptions;
    private readonly FaceRecognitionDemoService _faceRecognitionDemoService;

    public AuthController(
        UserManager<AppUser> userManager,
        AppDbContext dbContext,
        IJwtTokenService jwtTokenService,
        IPasswordGenerator passwordGenerator,
        IEmailService emailService,
        IEmailTemplateService emailTemplateService,
        IOptions<JwtOptions> jwtOptions,
        IOptions<UploadOptions> uploadOptions,
        IConfiguration configuration,
        ILogger<AuthController> logger,
        IFido2 fido2,
        PasskeyOperationStore passkeyOperationStore,
        IFileStorageService fileStorageService,
        FaceRecognitionDemoService faceRecognitionDemoService)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _jwtTokenService = jwtTokenService;
        _passwordGenerator = passwordGenerator;
        _emailService = emailService;
        _emailTemplateService = emailTemplateService;
        _jwtOptions = jwtOptions.Value;
        _uploadOptions = uploadOptions.Value;
        _configuration = configuration;
        _logger = logger;
        _fido2 = fido2;
        _passkeyOperationStore = passkeyOperationStore;
        _fileStorageService = fileStorageService;
        _faceRecognitionDemoService = faceRecognitionDemoService;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var existing = await _userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            if (!existing.EmailConfirmed)
            {
                var verificationToken = await _userManager.GenerateEmailConfirmationTokenAsync(existing);
                var verificationEncodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(verificationToken));
                var verificationUrl = BuildAbsoluteUrl($"/verify-email?userId={existing.Id}&token={verificationEncodedToken}");

                try
                {
                    await _emailService.SendAsync(
                        email,
                        "Habla Mas - Verifica tu correo",
                        _emailTemplateService.BuildVerificationEmail(
                            recipientName: existing.PublicAlias,
                            verifyUrl: verificationUrl,
                            pendingVerification: true));
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to resend verification email during register for existing user {UserId}", existing.Id);
                }

                return Ok(new
                {
                    message = "Email already registered but pending verification. Verification email was resent.",
                    email,
                    publicCode = existing.PublicCode,
                    alreadyRegistered = true,
                    emailConfirmed = false
                });
            }

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

        try
        {
            await _emailService.SendAsync(
                email,
                "Habla Mas - Verifica tu correo",
                _emailTemplateService.BuildVerificationEmail(
                    recipientName: user.PublicAlias,
                    verifyUrl: verifyUrl,
                    temporaryPassword: temporaryPassword));
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
            await _emailService.SendAsync(
                user.Email!,
                "Habla Mas - Verifica tu correo",
                _emailTemplateService.BuildVerificationEmail(
                    recipientName: user.PublicAlias,
                    verifyUrl: verifyUrl));
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

        return Ok(await CreateLoginResponseAsync(user));
    }

    [HttpGet("face-samples")]
    [Authorize]
    public async Task<IActionResult> GetFaceSamples()
    {
        var userId = User.GetRequiredUserId();
        var items = await _dbContext.FaceLoginSamples
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new
            {
                x.Id,
                x.ImageUrl,
                x.CreatedAt
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost("face-samples")]
    [Authorize]
    [RequestSizeLimit(5_242_880)]
    public async Task<IActionResult> CreateFaceSample([FromForm] IFormFile file)
    {
        var userId = User.GetRequiredUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest(new ProblemDetails { Title = "File required" });
        }

        if (!AllowedFaceImageTypes.Contains(file.ContentType))
        {
            return BadRequest(new ProblemDetails { Title = "Solo se permiten jpg, png o webp." });
        }

        var maxBytes = _uploadOptions.MaxMb * 1024 * 1024;
        if (file.Length > maxBytes)
        {
            return BadRequest(new ProblemDetails { Title = $"Max upload size is {_uploadOptions.MaxMb}MB" });
        }

        var currentCount = await _dbContext.FaceLoginSamples.CountAsync(x => x.UserId == userId);
        if (currentCount >= 5)
        {
            return BadRequest(new ProblemDetails { Title = "Puedes registrar un maximo de 5 fotos faciales." });
        }

        var extension = Path.GetExtension(file.FileName);
        await using var stream = file.OpenReadStream();
        var imageUrl = await _fileStorageService.SaveAsync(stream, $"face-login{extension}", HttpContext.RequestAborted);

        var sample = new FaceLoginSample
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ImageUrl = imageUrl,
            CreatedAt = DateTimeOffset.UtcNow
        };

        _dbContext.FaceLoginSamples.Add(sample);
        await _dbContext.SaveChangesAsync();

        return Ok(new
        {
            sample.Id,
            sample.ImageUrl,
            sample.CreatedAt
        });
    }

    [HttpDelete("face-samples/{sampleId:guid}")]
    [Authorize]
    public async Task<IActionResult> DeleteFaceSample(Guid sampleId)
    {
        var userId = User.GetRequiredUserId();
        var sample = await _dbContext.FaceLoginSamples
            .FirstOrDefaultAsync(x => x.Id == sampleId && x.UserId == userId);

        if (sample is null)
        {
            return NotFound(new ProblemDetails { Title = "Foto facial no encontrada." });
        }

        _dbContext.FaceLoginSamples.Remove(sample);
        await _dbContext.SaveChangesAsync();
        return Ok(new { message = "Foto facial eliminada." });
    }

    [HttpPost("face-login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponseDto>> FaceLogin([FromBody] FaceLoginRequest request)
    {
        if (!AllowedFaceImageTypes.Contains(request.ContentType))
        {
            return BadRequest(new ProblemDetails { Title = "Solo se permiten jpg, png o webp." });
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(request.Base64Data);
        }
        catch
        {
            return BadRequest(new ProblemDetails { Title = "La imagen facial no tiene un formato valido." });
        }

        var maxBytes = _uploadOptions.MaxMb * 1024 * 1024;
        if (bytes.Length == 0 || bytes.Length > maxBytes)
        {
            return BadRequest(new ProblemDetails { Title = $"La imagen facial debe pesar menos de {_uploadOptions.MaxMb}MB." });
        }

        var candidates = await _dbContext.Users
            .AsNoTracking()
            .Where(x => !x.IsBlocked && x.FaceLoginSamples.Any())
            .Select(x => new
            {
                x.Id,
                x.PublicAlias,
                Samples = x.FaceLoginSamples
                    .OrderByDescending(sample => sample.CreatedAt)
                    .Take(2)
                    .Select(sample => sample.ImageUrl)
                    .ToList()
            })
            .Take(12)
            .ToListAsync();

        if (candidates.Count == 0)
        {
            return BadRequest(new ProblemDetails { Title = "No hay perfiles con reconocimiento facial registrado." });
        }

        FaceRecognitionMatchResult match;
        try
        {
            match = await _faceRecognitionDemoService.IdentifyUserAsync(
                request.ContentType,
                request.Base64Data,
                candidates
                    .Select(candidate => new FaceRecognitionCandidate(
                        candidate.Id.ToString(),
                        candidate.PublicAlias,
                        candidate.Samples.Select(BuildAbsoluteAssetUrl).ToList()))
                    .ToList(),
                HttpContext.RequestAborted);
        }
        catch (FaceRecognitionProviderException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new ProblemDetails
            {
                Title = "No se pudo analizar el rostro.",
                Detail = ex.Message
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails
            {
                Title = "Reconocimiento facial no configurado.",
                Detail = ex.Message
            });
        }

        if (string.IsNullOrWhiteSpace(match.MatchedUserId)
            || !Guid.TryParse(match.MatchedUserId, out var matchedUserId)
            || match.Confidence < 85)
        {
            return Unauthorized(new ProblemDetails
            {
                Title = "No se pudo identificar un perfil.",
                Detail = match.Reason ?? "La selfie no coincide con suficiente confianza."
            });
        }

        var user = await _userManager.FindByIdAsync(matchedUserId.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(await CreateLoginResponseAsync(user));
    }

    [HttpGet("passkeys")]
    [Authorize]
    public async Task<IActionResult> GetPasskeys()
    {
        var userId = User.GetRequiredUserId();
        var passkeys = await _dbContext.PasskeyCredentials
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new
            {
                x.Id,
                x.FriendlyName,
                x.DeviceType,
                x.IsBackedUp,
                x.CreatedAt,
                x.LastUsedAt
            })
            .ToListAsync();

        return Ok(passkeys);
    }

    [HttpPost("passkeys/register/options")]
    [Authorize]
    public async Task<IActionResult> CreatePasskeyRegistrationOptions()
    {
        var userId = User.GetRequiredUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        var existingCredentials = await _dbContext.PasskeyCredentials
            .Where(x => x.UserId == user.Id)
            .AsNoTracking()
            .ToListAsync();

        var options = _fido2.RequestNewCredential(new RequestNewCredentialParams
        {
            User = new Fido2User
            {
                DisplayName = user.PublicAlias,
                Name = user.Email ?? user.PublicAlias,
                Id = user.Id.ToByteArray()
            },
            ExcludeCredentials = existingCredentials
                .Select(x => new PublicKeyCredentialDescriptor(x.CredentialId))
                .ToList(),
            AuthenticatorSelection = new AuthenticatorSelection
            {
                AuthenticatorAttachment = AuthenticatorAttachment.Platform,
                ResidentKey = ResidentKeyRequirement.Preferred,
                UserVerification = UserVerificationRequirement.Required
            },
            AttestationPreference = AttestationConveyancePreference.None,
            Extensions = new AuthenticationExtensionsClientInputs
            {
                CredProps = true
            }
        });

        _passkeyOperationStore.SetRegistrationOptions(user.Id, options.ToJson());
        return Ok(options);
    }

    [HttpPost("passkeys/register/verify")]
    [Authorize]
    public async Task<IActionResult> VerifyPasskeyRegistration([FromBody] PasskeyRegisterVerifyRequest request)
    {
        if (request.Credential is null)
        {
            return BadRequest(new ProblemDetails { Title = "Passkey credential is required" });
        }

        var userId = User.GetRequiredUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        var jsonOptions = _passkeyOperationStore.TakeRegistrationOptions(userId);
        if (string.IsNullOrWhiteSpace(jsonOptions))
        {
            return BadRequest(new ProblemDetails { Title = "Registration session expired" });
        }

        var options = CredentialCreateOptions.FromJson(jsonOptions);
        IsCredentialIdUniqueToUserAsyncDelegate callback = async (args, cancellationToken) =>
        {
            var allCredentials = await _dbContext.PasskeyCredentials
                .AsNoTracking()
                .Select(x => x.CredentialId)
                .ToListAsync(cancellationToken);

            return allCredentials.All(x => !x.AsSpan().SequenceEqual(args.CredentialId));
        };

        var result = await _fido2.MakeNewCredentialAsync(new MakeNewCredentialParams
        {
            AttestationResponse = request.Credential,
            OriginalOptions = options,
            IsCredentialIdUniqueToUserCallback = callback
        });

        _dbContext.PasskeyCredentials.Add(new PasskeyCredential
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            CredentialId = result.Id,
            PublicKey = result.PublicKey,
            SignatureCounter = result.SignCount,
            FriendlyName = NormalizePasskeyFriendlyName(request.FriendlyName),
            DeviceType = result.IsBackupEligible ? "Sincronizado" : "Este dispositivo",
            IsBackedUp = result.IsBackedUp,
            Transports = string.Join(",", result.Transports ?? [])
        });

        await _dbContext.SaveChangesAsync();

        return Ok(new { message = "Acceso biometrico activado." });
    }

    [HttpDelete("passkeys/{passkeyId:guid}")]
    [Authorize]
    public async Task<IActionResult> DeletePasskey(Guid passkeyId)
    {
        var userId = User.GetRequiredUserId();
        var credential = await _dbContext.PasskeyCredentials
            .FirstOrDefaultAsync(x => x.Id == passkeyId && x.UserId == userId);

        if (credential is null)
        {
            return NotFound(new ProblemDetails { Title = "Passkey not found" });
        }

        _dbContext.PasskeyCredentials.Remove(credential);
        await _dbContext.SaveChangesAsync();
        return Ok(new { message = "Acceso biometrico eliminado." });
    }

    [HttpPost("passkeys/authenticate/options")]
    [AllowAnonymous]
    public async Task<IActionResult> CreatePasskeyAuthenticationOptions([FromBody] PasskeyAuthenticateOptionsRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _userManager.Users
            .FirstOrDefaultAsync(x => x.Email == email);

        if (user is null)
        {
            return NotFound(new ProblemDetails { Title = "No se encontro un usuario con ese correo." });
        }

        if (user.IsBlocked)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "User blocked" });
        }

        var credentials = await _dbContext.PasskeyCredentials
            .Where(x => x.UserId == user.Id)
            .AsNoTracking()
            .ToListAsync();

        if (credentials.Count == 0)
        {
            return BadRequest(new ProblemDetails { Title = "Este usuario no tiene acceso biometrico activado." });
        }

        var options = _fido2.GetAssertionOptions(new GetAssertionOptionsParams
        {
            AllowedCredentials = credentials
                .Select(x => new PublicKeyCredentialDescriptor(x.CredentialId))
                .ToList(),
            UserVerification = UserVerificationRequirement.Required,
            Extensions = new AuthenticationExtensionsClientInputs()
        });

        var operationId = _passkeyOperationStore.SetAuthenticationOptions(user.Id, email, options.ToJson());

        return Ok(new
        {
            operationId,
            publicKey = options
        });
    }

    [HttpPost("passkeys/authenticate/verify")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponseDto>> VerifyPasskeyAuthentication([FromBody] PasskeyAuthenticateVerifyRequest request)
    {
        if (request.Credential is null || string.IsNullOrWhiteSpace(request.OperationId))
        {
            return BadRequest(new ProblemDetails { Title = "Passkey verification payload is incomplete" });
        }

        var operation = _passkeyOperationStore.TakeAuthenticationOptions(request.OperationId);
        if (operation is null)
        {
            return BadRequest(new ProblemDetails { Title = "Authentication session expired" });
        }

        var user = await _userManager.Users.FirstOrDefaultAsync(x => x.Id == operation.UserId);
        if (user is null)
        {
            return Unauthorized();
        }

        if (user.IsBlocked)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "User blocked" });
        }

        var options = AssertionOptions.FromJson(operation.OptionsJson);
        var storedCredential = (await _dbContext.PasskeyCredentials
            .Where(x => x.UserId == user.Id)
            .ToListAsync())
            .FirstOrDefault(x => x.CredentialId.AsSpan().SequenceEqual(request.Credential.RawId));

        if (storedCredential is null)
        {
            return Unauthorized(new ProblemDetails { Title = "Passkey not recognized" });
        }

        IsUserHandleOwnerOfCredentialIdAsync callback = async (args, cancellationToken) =>
        {
            var userCredentials = await _dbContext.PasskeyCredentials
                .Where(x => x.UserId == user.Id)
                .AsNoTracking()
                .Select(x => x.CredentialId)
                .ToListAsync(cancellationToken);

            return args.UserHandle is not null
                && args.UserHandle.AsSpan().SequenceEqual(user.Id.ToByteArray())
                && userCredentials.Any(x => x.AsSpan().SequenceEqual(args.CredentialId));
        };

        var result = await _fido2.MakeAssertionAsync(new MakeAssertionParams
        {
            AssertionResponse = request.Credential,
            OriginalOptions = options,
            StoredPublicKey = storedCredential.PublicKey,
            StoredSignatureCounter = storedCredential.SignatureCounter,
            IsUserHandleOwnerOfCredentialIdCallback = callback
        });

        storedCredential.SignatureCounter = result.SignCount;
        storedCredential.IsBackedUp = result.IsBackedUp;
        storedCredential.LastUsedAt = DateTimeOffset.UtcNow;

        return Ok(await CreateLoginResponseAsync(user, saveChanges: true));
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

        try
        {
            await _emailService.SendAsync(
                user.Email!,
                "Habla Mas - Reset de contrasena",
                _emailTemplateService.BuildPasswordResetEmail(
                    recipientName: user.PublicAlias,
                    resetUrl: resetUrl));
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

    private string BuildAbsoluteAssetUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out _))
        {
            return url;
        }

        if (!url.StartsWith('/'))
        {
            url = $"/{url}";
        }

        return BuildAbsoluteUrl(url);
    }

    private async Task<AuthResponseDto> CreateLoginResponseAsync(AppUser user, bool saveChanges = true)
    {
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

        if (saveChanges)
        {
            await _dbContext.SaveChangesAsync();
        }

        return new AuthResponseDto
        {
            AccessToken = accessToken,
            RefreshToken = refreshTokenValue,
            MustChangePassword = user.MustChangePassword,
            EmailConfirmed = user.EmailConfirmed,
            UserId = user.Id.ToString(),
            Email = user.Email ?? string.Empty,
            PublicAlias = user.PublicAlias,
            Roles = roles.ToArray()
        };
    }

    private static string NormalizePasskeyFriendlyName(string? friendlyName)
    {
        var normalized = friendlyName?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? "Acceso biometrico" : normalized[..Math.Min(normalized.Length, 120)];
    }

    private static Dictionary<string, string[]> ToErrors(IdentityResult result)
    {
        return result.Errors
            .GroupBy(e => e.Code)
            .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray());
    }
}
