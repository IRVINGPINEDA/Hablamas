using HablaMas.Api.Contracts.Profile;
using HablaMas.Api.Extensions;
using HablaMas.Application.Interfaces;
using HablaMas.Infrastructure.Data;
using HablaMas.Infrastructure.Options;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace HablaMas.Api.Controllers;

[ApiController]
[Route("api/profile")]
[Authorize]
public sealed class ProfileController : ControllerBase
{
    private static readonly HashSet<string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp"
    };

    private readonly AppDbContext _dbContext;
    private readonly IFileStorageService _fileStorageService;
    private readonly UploadOptions _uploadOptions;

    public ProfileController(AppDbContext dbContext, IFileStorageService fileStorageService, IOptions<UploadOptions> uploadOptions)
    {
        _dbContext = dbContext;
        _fileStorageService = fileStorageService;
        _uploadOptions = uploadOptions.Value;
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var userId = User.GetRequiredUserId();
        var user = await _dbContext.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(new
        {
            user.Id,
            user.FirstName,
            user.LastName,
            user.Email,
            user.Address,
            phone = user.PhoneNumber,
            user.PublicAlias,
            user.PublicCode,
            user.Bio,
            user.ProfileImageUrl,
            user.Theme,
            user.AccentColor,
            user.EmailConfirmed,
            user.MustChangePassword,
            user.IsBlocked,
            user.CreatedAt,
            user.LastLoginAt
        });
    }

    [HttpPut("me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateProfileRequest request)
    {
        var userId = User.GetRequiredUserId();
        var user = await _dbContext.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null)
        {
            return Unauthorized();
        }

        user.Bio = request.Bio?.Trim() ?? string.Empty;
        user.PublicAlias = string.IsNullOrWhiteSpace(request.PublicAlias) ? user.PublicAlias : request.PublicAlias.Trim();
        user.Theme = request.Theme;
        user.AccentColor = request.AccentColor.Trim();

        await _dbContext.SaveChangesAsync();

        return Ok(new { message = "Profile updated" });
    }

    [HttpPost("image")]
    [RequestSizeLimit(5_242_880)]
    public async Task<IActionResult> UploadProfileImage([FromForm] IFormFile file)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new ProblemDetails { Title = "File required" });
        }

        if (!AllowedImageTypes.Contains(file.ContentType))
        {
            return BadRequest(new ProblemDetails { Title = "Unsupported image type" });
        }

        var maxBytes = _uploadOptions.MaxMb * 1024 * 1024;
        if (file.Length > maxBytes)
        {
            return BadRequest(new ProblemDetails { Title = $"Max upload size is {_uploadOptions.MaxMb}MB" });
        }

        var extension = Path.GetExtension(file.FileName);
        await using var stream = file.OpenReadStream();
        var url = await _fileStorageService.SaveAsync(stream, $"profile{extension}", HttpContext.RequestAborted);

        var userId = User.GetRequiredUserId();
        var user = await _dbContext.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (user is null)
        {
            return Unauthorized();
        }

        user.ProfileImageUrl = url;
        await _dbContext.SaveChangesAsync();

        return Ok(new { imageUrl = url });
    }
}
