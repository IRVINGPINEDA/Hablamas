using System.Security.Claims;

namespace HablaMas.Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetRequiredUserId(this ClaimsPrincipal user)
    {
        var raw = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        if (!Guid.TryParse(raw, out var id))
        {
            throw new UnauthorizedAccessException("Invalid authenticated user id.");
        }

        return id;
    }
}
