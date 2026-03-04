namespace HablaMas.Application.Interfaces;

public interface IFileStorageService
{
    Task<string> SaveAsync(Stream fileStream, string fileName, CancellationToken cancellationToken = default);
}
