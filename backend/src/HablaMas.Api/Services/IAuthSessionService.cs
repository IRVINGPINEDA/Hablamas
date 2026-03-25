using HablaMas.Application.DTOs;
using HablaMas.Domain.Entities;

namespace HablaMas.Api.Services;

public interface IAuthSessionService
{
    Task<AuthResponseDto> CreateSessionAsync(AppUser user, CancellationToken cancellationToken = default);
}
