using HablaMas.Domain.Entities;

namespace HablaMas.Application.Interfaces;

public interface IJwtTokenService
{
    string CreateAccessToken(AppUser user, IList<string> roles);
    string CreateRefreshTokenValue();
}
