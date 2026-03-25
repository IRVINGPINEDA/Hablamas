using HablaMas.Application.DTOs;
using HablaMas.Application.Interfaces;
using HablaMas.Domain.Entities;
using HablaMas.Infrastructure.Data;
using HablaMas.Infrastructure.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace HablaMas.Api.Services;

public sealed class AuthSessionService : IAuthSessionService
{
    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _dbContext;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly JwtOptions _jwtOptions;

    public AuthSessionService(
        UserManager<AppUser> userManager,
        AppDbContext dbContext,
        IJwtTokenService jwtTokenService,
        IOptions<JwtOptions> jwtOptions)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _jwtTokenService = jwtTokenService;
        _jwtOptions = jwtOptions.Value;
    }

    public async Task<AuthResponseDto> CreateSessionAsync(AppUser user, CancellationToken cancellationToken = default)
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
        await _dbContext.SaveChangesAsync(cancellationToken);

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
}
