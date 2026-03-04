using System.Security.Cryptography;
using HablaMas.Application.Interfaces;

namespace HablaMas.Infrastructure.Services;

public sealed class PasswordGenerator : IPasswordGenerator
{
    private const string Allowed = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

    public string GenerateTemporaryPassword(int length = 16)
    {
        if (length < 12)
        {
            length = 12;
        }

        var chars = new char[length];
        var bytes = RandomNumberGenerator.GetBytes(length);

        for (var i = 0; i < length; i++)
        {
            chars[i] = Allowed[bytes[i] % Allowed.Length];
        }

        return new string(chars);
    }
}
