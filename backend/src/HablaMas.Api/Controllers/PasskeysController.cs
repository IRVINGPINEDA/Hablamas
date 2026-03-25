using System.Text.Json;
using Fido2NetLib;
using Fido2NetLib.Objects;
using HablaMas.Api.Contracts.Auth;
using HablaMas.Api.Extensions;
using HablaMas.Api.Options;
using HablaMas.Api.Services;
using HablaMas.Domain.Entities;
using HablaMas.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/auth/passkeys")]
public sealed class PasskeysController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IFido2 _fido2;
    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _dbContext;
    private readonly IAuthSessionService _authSessionService;
    private readonly IPasskeyOperationStore _operationStore;
    private readonly PasskeyOptions _passkeyOptions;
    private readonly ILogger<PasskeysController> _logger;

    public PasskeysController(
        IFido2 fido2,
        UserManager<AppUser> userManager,
        AppDbContext dbContext,
        IAuthSessionService authSessionService,
        IPasskeyOperationStore operationStore,
        IOptions<PasskeyOptions> passkeyOptions,
        ILogger<PasskeysController> logger)
    {
        _fido2 = fido2;
        _userManager = userManager;
        _dbContext = dbContext;
        _authSessionService = authSessionService;
        _operationStore = operationStore;
        _passkeyOptions = passkeyOptions.Value;
        _logger = logger;
    }

    [HttpGet("credentials")]
    [Authorize]
    public async Task<ActionResult<IReadOnlyList<PasskeyListItemDto>>> GetCredentials(CancellationToken cancellationToken)
    {
        var userId = User.GetRequiredUserId();
        var credentials = await _dbContext.PasskeyCredentials
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(cancellationToken);

        return Ok(credentials.Select(x => new PasskeyListItemDto
        {
            Id = x.Id,
            FriendlyName = x.FriendlyName,
            CredentialId = WebEncoders.Base64UrlEncode(x.CredentialId),
            AuthenticatorAttachment = x.AuthenticatorAttachment,
            Transports = DeserializeTransports(x.TransportsJson),
            CreatedAt = x.CreatedAt,
            LastUsedAt = x.LastUsedAt
        }).ToArray());
    }

    [HttpDelete("credentials/{passkeyId:guid}")]
    [Authorize]
    public async Task<IActionResult> DeleteCredential(Guid passkeyId, CancellationToken cancellationToken)
    {
        var userId = User.GetRequiredUserId();
        var credential = await _dbContext.PasskeyCredentials
            .FirstOrDefaultAsync(x => x.Id == passkeyId && x.UserId == userId, cancellationToken);

        if (credential is null)
        {
            return NotFound(new ProblemDetails
            {
                Title = "Passkey not found",
                Detail = "La clave segura indicada no existe o no pertenece a tu cuenta."
            });
        }

        _dbContext.PasskeyCredentials.Remove(credential);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            message = "Clave segura eliminada correctamente."
        });
    }

    [HttpPost("register/options")]
    [Authorize]
    public async Task<IActionResult> CreateRegistrationOptions([FromBody] PasskeyRegisterOptionsRequest? request, CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
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
            return BadRequest(new ProblemDetails
            {
                Title = "Email confirmation required",
                Detail = "Debes verificar tu correo antes de registrar una clave segura."
            });
        }

        var existingCredentialIds = await _dbContext.PasskeyCredentials
            .Where(x => x.UserId == user.Id)
            .Select(x => x.CredentialId)
            .ToListAsync(cancellationToken);

        var options = _fido2.RequestNewCredential(new RequestNewCredentialParams
        {
            User = new Fido2User
            {
                DisplayName = user.PublicAlias,
                Name = user.Email ?? user.PublicAlias,
                Id = CreateUserHandle(user.Id)
            },
            ExcludeCredentials = existingCredentialIds.Select(x => new PublicKeyCredentialDescriptor(x)).ToList(),
            AuthenticatorSelection = new AuthenticatorSelection
            {
                ResidentKey = ResidentKeyRequirement.Required,
                UserVerification = UserVerificationRequirement.Required
            },
            AttestationPreference = AttestationConveyancePreference.None,
            Extensions = new AuthenticationExtensionsClientInputs
            {
                CredProps = true
            }
        });

        options.Timeout = (ulong)Math.Max(_passkeyOptions.TimeoutMs, 30000);

        var operationId = Guid.NewGuid().ToString("N");
        await _operationStore.StoreAsync(
            operationId,
            new PasskeyRegistrationState
            {
                UserId = user.Id,
                DeviceName = request?.DeviceName?.Trim(),
                OptionsJson = options.ToJson()
            },
            TimeSpan.FromSeconds(Math.Max(_passkeyOptions.OperationTtlSeconds, 60)),
            cancellationToken);

        return Ok(new
        {
            operationId,
            options
        });
    }

    [HttpPost("register/verify")]
    [Authorize]
    public async Task<IActionResult> VerifyRegistration([FromBody] PasskeyRegisterVerifyRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.OperationId))
        {
            return BadRequest(new ProblemDetails { Title = "Operation id is required" });
        }

        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var state = await _operationStore.TakeAsync<PasskeyRegistrationState>(request.OperationId, cancellationToken);
        if (state is null)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Registration expired",
                Detail = "La operacion de registro expiro. Intenta nuevamente."
            });
        }

        if (state.UserId != user.Id)
        {
            return Unauthorized();
        }

        var originalOptions = CredentialCreateOptions.FromJson(state.OptionsJson);
        IsCredentialIdUniqueToUserAsyncDelegate callback = async (args, ct) =>
            !await _dbContext.PasskeyCredentials.AnyAsync(x => x.CredentialId.SequenceEqual(args.CredentialId), ct);

        try
        {
            var result = await _fido2.MakeNewCredentialAsync(new MakeNewCredentialParams
            {
                AttestationResponse = request.Credential,
                OriginalOptions = originalOptions,
                IsCredentialIdUniqueToUserCallback = callback
            });

            var friendlyName = await BuildFriendlyNameAsync(
                user.Id,
                request.DeviceName ?? state.DeviceName,
                cancellationToken);

            _dbContext.PasskeyCredentials.Add(new PasskeyCredential
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                CredentialId = result.Id,
                PublicKey = result.PublicKey,
                SignCount = result.SignCount,
                UserHandle = CreateUserHandle(user.Id),
                FriendlyName = friendlyName,
                AuthenticatorAttachment = request.AuthenticatorAttachment,
                TransportsJson = SerializeTransports(request.Credential.Response.Transports.Select(x => x.ToString()))
            });

            await _dbContext.SaveChangesAsync(cancellationToken);

            return Ok(new
            {
                message = "Clave segura registrada correctamente.",
                friendlyName
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Passkey registration failed for user {UserId}", user.Id);
            return BadRequest(new ProblemDetails
            {
                Title = "Passkey registration failed",
                Detail = "No se pudo registrar la clave segura."
            });
        }
    }

    [HttpPost("login/options")]
    [AllowAnonymous]
    public async Task<IActionResult> CreateLoginOptions([FromBody] PasskeyLoginOptionsRequest? request, CancellationToken cancellationToken)
    {
        var normalizedEmail = request?.Email?.Trim().ToLowerInvariant();
        List<PublicKeyCredentialDescriptor> allowedCredentials = [];

        if (!string.IsNullOrWhiteSpace(normalizedEmail))
        {
            var user = await _userManager.Users
                .Include(x => x.PasskeyCredentials)
                .FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken);

            if (user?.IsBlocked == true)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "User blocked" });
            }

            if (user is null || user.PasskeyCredentials.Count == 0)
            {
                return BadRequest(new ProblemDetails
                {
                    Title = "No passkeys found",
                    Detail = "No existe una clave segura registrada para ese correo."
                });
            }

            allowedCredentials = user.PasskeyCredentials
                .Select(x => new PublicKeyCredentialDescriptor(x.CredentialId))
                .ToList();
        }

        var options = _fido2.GetAssertionOptions(new GetAssertionOptionsParams
        {
            AllowedCredentials = allowedCredentials,
            UserVerification = UserVerificationRequirement.Required
        });

        options.Timeout = (ulong)Math.Max(_passkeyOptions.TimeoutMs, 30000);

        var operationId = Guid.NewGuid().ToString("N");
        await _operationStore.StoreAsync(
            operationId,
            new PasskeyAuthenticationState
            {
                RequestedEmail = normalizedEmail,
                OptionsJson = options.ToJson()
            },
            TimeSpan.FromSeconds(Math.Max(_passkeyOptions.OperationTtlSeconds, 60)),
            cancellationToken);

        return Ok(new
        {
            operationId,
            options
        });
    }

    [HttpPost("login/verify")]
    [AllowAnonymous]
    public async Task<ActionResult<HablaMas.Application.DTOs.AuthResponseDto>> VerifyLogin([FromBody] PasskeyLoginVerifyRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.OperationId))
        {
            return BadRequest(new ProblemDetails { Title = "Operation id is required" });
        }

        var state = await _operationStore.TakeAsync<PasskeyAuthenticationState>(request.OperationId, cancellationToken);
        if (state is null)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Authentication expired",
                Detail = "La operacion de autenticacion expiro. Intenta nuevamente."
            });
        }

        var storedCredential = await _dbContext.PasskeyCredentials
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.CredentialId.SequenceEqual(request.Credential.RawId), cancellationToken);

        if (storedCredential is null)
        {
            return Unauthorized(new ProblemDetails { Title = "Invalid passkey" });
        }

        if (!string.IsNullOrWhiteSpace(state.RequestedEmail) &&
            !string.Equals(storedCredential.User.Email, state.RequestedEmail, StringComparison.OrdinalIgnoreCase))
        {
            return Unauthorized(new ProblemDetails { Title = "Invalid passkey" });
        }

        if (storedCredential.User.IsBlocked)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ProblemDetails { Title = "User blocked" });
        }

        var originalOptions = AssertionOptions.FromJson(state.OptionsJson);
        IsUserHandleOwnerOfCredentialIdAsync callback = async (args, ct) =>
            await _dbContext.PasskeyCredentials.AnyAsync(
                x => x.CredentialId.SequenceEqual(args.CredentialId) &&
                     x.UserHandle.SequenceEqual(args.UserHandle),
                ct);

        try
        {
            var result = await _fido2.MakeAssertionAsync(new MakeAssertionParams
            {
                AssertionResponse = request.Credential,
                OriginalOptions = originalOptions,
                StoredPublicKey = storedCredential.PublicKey,
                StoredSignatureCounter = (uint)Math.Clamp(storedCredential.SignCount, 0, uint.MaxValue),
                IsUserHandleOwnerOfCredentialIdCallback = callback
            });

            storedCredential.SignCount = result.SignCount;
            storedCredential.LastUsedAt = DateTimeOffset.UtcNow;

            var authResponse = await _authSessionService.CreateSessionAsync(storedCredential.User, cancellationToken);
            return Ok(authResponse);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Passkey assertion failed for credential {CredentialId}", WebEncoders.Base64UrlEncode(storedCredential.CredentialId));
            return Unauthorized(new ProblemDetails { Title = "Invalid passkey" });
        }
    }

    private async Task<AppUser?> GetCurrentUserAsync(CancellationToken cancellationToken)
    {
        var userId = User.GetRequiredUserId();
        return await _userManager.Users.FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
    }

    private async Task<string> BuildFriendlyNameAsync(Guid userId, string? requestedName, CancellationToken cancellationToken)
    {
        var trimmed = requestedName?.Trim();
        if (!string.IsNullOrWhiteSpace(trimmed))
        {
            return trimmed.Length <= 120 ? trimmed : trimmed[..120];
        }

        var existingCount = await _dbContext.PasskeyCredentials.CountAsync(x => x.UserId == userId, cancellationToken);
        return $"Clave segura {existingCount + 1}";
    }

    private static byte[] CreateUserHandle(Guid userId) => userId.ToByteArray();

    private static string[] DeserializeTransports(string? transportsJson)
    {
        if (string.IsNullOrWhiteSpace(transportsJson))
        {
            return [];
        }

        return JsonSerializer.Deserialize<string[]>(transportsJson, JsonOptions) ?? [];
    }

    private static string? SerializeTransports(IEnumerable<string>? transports)
    {
        if (transports is null)
        {
            return null;
        }

        var items = transports
            .Select(x => x.ToString())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return items.Length == 0 ? null : JsonSerializer.Serialize(items, JsonOptions);
    }
}
