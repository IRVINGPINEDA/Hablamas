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
[Route("api/uploads")]
[Authorize]
public sealed class UploadsController : ControllerBase
{
    private static readonly HashSet<string> AllowedImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp"
    };

    private readonly IFileStorageService _fileStorageService;
    private readonly UploadOptions _uploadOptions;
    private readonly AppDbContext _dbContext;

    public UploadsController(IFileStorageService fileStorageService, IOptions<UploadOptions> uploadOptions, AppDbContext dbContext)
    {
        _fileStorageService = fileStorageService;
        _uploadOptions = uploadOptions.Value;
        _dbContext = dbContext;
    }

    [HttpPost("message-image")]
    [RequestSizeLimit(5_242_880)]
    public async Task<IActionResult> UploadMessageImage([FromForm] IFormFile file)
    {
        var userId = User.GetRequiredUserId();
        var accessResult = await EnsureCanChatAsync(userId);
        if (accessResult is not null)
        {
            return accessResult;
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest(new ProblemDetails { Title = "File required" });
        }

        if (!AllowedImageTypes.Contains(file.ContentType))
        {
            return BadRequest(new ProblemDetails { Title = "Only jpg, png and webp are allowed" });
        }

        var maxBytes = _uploadOptions.MaxMb * 1024 * 1024;
        if (file.Length > maxBytes)
        {
            return BadRequest(new ProblemDetails { Title = $"Max upload size is {_uploadOptions.MaxMb}MB" });
        }

        var extension = Path.GetExtension(file.FileName);
        await using var stream = file.OpenReadStream();
        var url = await _fileStorageService.SaveAsync(stream, $"message{extension}", HttpContext.RequestAborted);

        return Ok(new { url, messageType = "image" });
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
