using HablaMas.Api.Extensions;
using HablaMas.Application.Interfaces;
using HablaMas.Domain.Enums;
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

    private static readonly HashSet<string> AllowedVideoTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "video/mp4",
        "video/webm",
        "video/quicktime"
    };

    private static readonly HashSet<string> AllowedAudioTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "audio/aac",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        "audio/x-wav"
    };

    private static readonly HashSet<string> AllowedFileTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/json",
        "application/msword",
        "application/octet-stream",
        "application/pdf",
        "application/rtf",
        "application/vnd.ms-excel",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/x-rar-compressed",
        "application/x-zip-compressed",
        "application/zip",
        "text/csv",
        "text/plain"
    };

    private static readonly HashSet<string> AllowedFileExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".csv",
        ".doc",
        ".docx",
        ".json",
        ".pdf",
        ".ppt",
        ".pptx",
        ".rar",
        ".rtf",
        ".txt",
        ".xls",
        ".xlsx",
        ".zip"
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

    [HttpPost("message-attachment")]
    [RequestSizeLimit(104_857_600)]
    public async Task<IActionResult> UploadMessageAttachment([FromForm] IFormFile file)
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

        var messageType = ResolveAttachmentMessageType(file.ContentType, Path.GetExtension(file.FileName));
        if (messageType is null)
        {
            return BadRequest(new ProblemDetails { Title = "Unsupported attachment type" });
        }

        var maxBytes = _uploadOptions.MaxAttachmentMb * 1024 * 1024;
        if (file.Length > maxBytes)
        {
            return BadRequest(new ProblemDetails { Title = $"Max attachment size is {_uploadOptions.MaxAttachmentMb}MB" });
        }

        var extension = Path.GetExtension(file.FileName);
        await using var stream = file.OpenReadStream();
        var url = await _fileStorageService.SaveAsync(stream, $"attachment{extension}", HttpContext.RequestAborted);

        return Ok(new
        {
            url,
            messageType = messageType.Value.ToString().ToLowerInvariant(),
            attachmentName = file.FileName,
            attachmentContentType = file.ContentType,
            attachmentSizeBytes = file.Length
        });
    }

    private static MessageType? ResolveAttachmentMessageType(string? contentType, string? extension)
    {
        if (!string.IsNullOrWhiteSpace(contentType))
        {
            if (AllowedImageTypes.Contains(contentType))
            {
                return MessageType.Image;
            }

            if (AllowedVideoTypes.Contains(contentType))
            {
                return MessageType.Video;
            }

            if (AllowedAudioTypes.Contains(contentType))
            {
                return MessageType.Audio;
            }

            if (AllowedFileTypes.Contains(contentType))
            {
                return MessageType.File;
            }
        }

        if (!string.IsNullOrWhiteSpace(extension) && AllowedFileExtensions.Contains(extension))
        {
            return MessageType.File;
        }

        return null;
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
