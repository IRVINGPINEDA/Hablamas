using HablaMas.Application.Interfaces;
using HablaMas.Infrastructure.Options;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace HablaMas.Infrastructure.Services;

public sealed class LocalFileStorageService : IFileStorageService
{
    private readonly UploadOptions _options;
    private readonly string _baseUrl;

    public LocalFileStorageService(IOptions<UploadOptions> options, IConfiguration configuration)
    {
        _options = options.Value;
        _baseUrl = configuration["APP_BASE_URL"]?.TrimEnd('/') ?? string.Empty;
    }

    public async Task<string> SaveAsync(Stream fileStream, string fileName, CancellationToken cancellationToken = default)
    {
        var rootPath = _options.Path;
        Directory.CreateDirectory(rootPath);

        var safeName = $"{Guid.NewGuid():N}_{fileName.Replace(' ', '_')}";
        var fullPath = Path.Combine(rootPath, safeName);

        await using var output = File.Create(fullPath);
        await fileStream.CopyToAsync(output, cancellationToken);

        if (string.IsNullOrWhiteSpace(_baseUrl))
        {
            return $"/uploads/{safeName}";
        }

        return $"{_baseUrl}/uploads/{safeName}";
    }
}
