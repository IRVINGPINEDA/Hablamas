namespace HablaMas.Application.Interfaces;

public interface IPasswordGenerator
{
    string GenerateTemporaryPassword(int length = 16);
}
