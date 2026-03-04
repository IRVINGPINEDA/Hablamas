using HablaMas.Domain.Entities;
using HablaMas.Infrastructure.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HablaMas.Infrastructure.Data;

public sealed class DatabaseSeeder
{
    private readonly RoleManager<AppRole> _roleManager;
    private readonly UserManager<AppUser> _userManager;
    private readonly AdminOptions _adminOptions;
    private readonly ILogger<DatabaseSeeder> _logger;

    public DatabaseSeeder(
        RoleManager<AppRole> roleManager,
        UserManager<AppUser> userManager,
        IOptions<AdminOptions> adminOptions,
        ILogger<DatabaseSeeder> logger)
    {
        _roleManager = roleManager;
        _userManager = userManager;
        _adminOptions = adminOptions.Value;
        _logger = logger;
    }

    public async Task SeedAsync()
    {
        foreach (var role in new[] { "User", "Admin" })
        {
            if (!await _roleManager.RoleExistsAsync(role))
            {
                await _roleManager.CreateAsync(new AppRole { Name = role, NormalizedName = role.ToUpperInvariant() });
            }
        }

        if (string.IsNullOrWhiteSpace(_adminOptions.SeedEmail) || string.IsNullOrWhiteSpace(_adminOptions.SeedPassword))
        {
            _logger.LogInformation("Admin seed skipped. ADMIN__SeedEmail or ADMIN__SeedPassword not configured.");
            return;
        }

        var admin = await _userManager.FindByEmailAsync(_adminOptions.SeedEmail);
        if (admin is null)
        {
            admin = new AppUser
            {
                Id = Guid.NewGuid(),
                Email = _adminOptions.SeedEmail,
                UserName = _adminOptions.SeedEmail,
                FirstName = "System",
                LastName = "Admin",
                Address = "N/A",
                PhoneNumber = "N/A",
                PublicAlias = "Administrador",
                PublicCode = $"ADM{Guid.NewGuid():N}"[..12],
                EmailConfirmed = true,
                MustChangePassword = false,
                CreatedAt = DateTimeOffset.UtcNow
            };

            var result = await _userManager.CreateAsync(admin, _adminOptions.SeedPassword);
            if (!result.Succeeded)
            {
                var reasons = string.Join(", ", result.Errors.Select(x => x.Description));
                throw new InvalidOperationException($"Failed to seed admin user: {reasons}");
            }

            await _userManager.AddToRoleAsync(admin, "Admin");
            _logger.LogInformation("Admin user seeded: {Email}", _adminOptions.SeedEmail);
        }
    }
}
