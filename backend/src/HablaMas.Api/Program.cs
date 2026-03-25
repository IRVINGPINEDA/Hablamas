using System.Security.Claims;
using System.Text;
using Fido2NetLib;
using HablaMas.Api.Hubs;
using HablaMas.Api.Options;
using HablaMas.Api.Services;
using HablaMas.Infrastructure.Data;
using HablaMas.Infrastructure.DependencyInjection;
using HablaMas.Infrastructure.Options;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddSingleton<PresenceTracker>();
builder.Services.AddScoped<IAuthSessionService, AuthSessionService>();
builder.Services.AddScoped<IWebPushService, WebPushService>();
builder.Services.AddSingleton<IPasskeyOperationStore, PasskeyOperationStore>();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient("openai", client =>
{
    client.Timeout = TimeSpan.FromSeconds(120);
});

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Habla Mas API",
        Version = "v1"
    });

    var securityScheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Description = "JWT Authorization header using the Bearer scheme.",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Reference = new OpenApiReference
        {
            Type = ReferenceType.SecurityScheme,
            Id = "Bearer"
        }
    };

    options.AddSecurityDefinition("Bearer", securityScheme);
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { securityScheme, Array.Empty<string>() }
    });
});
var passkeyOptions = ResolvePasskeyOptions(builder.Configuration);
builder.Services.AddSingleton(Options.Create(passkeyOptions));
builder.Services.Configure<WebPushOptions>(builder.Configuration.GetSection(WebPushOptions.SectionName));
builder.Services.AddFido2(options =>
{
    options.ServerDomain = passkeyOptions.RpId;
    options.ServerName = passkeyOptions.RpName;
    options.Origins = passkeyOptions.Origins.ToHashSet(StringComparer.OrdinalIgnoreCase);
});

var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwt.Key))
{
    throw new InvalidOperationException("JWT:Key is required.");
}

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = ClaimTypes.NameIdentifier,
            RoleClaimType = ClaimTypes.Role
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrWhiteSpace(accessToken) && path.StartsWithSegments("/hubs/chat"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.DefaultPolicy = new AuthorizationPolicyBuilder(JwtBearerDefaults.AuthenticationScheme)
        .RequireAuthenticatedUser()
        .Build();
});

var signalRBuilder = builder.Services.AddSignalR();
var redisConnection = builder.Configuration["Redis:ConnectionString"];
if (!string.IsNullOrWhiteSpace(redisConnection))
{
    builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConnection));

    signalRBuilder.AddStackExchangeRedis(redisConnection, options =>
    {
        options.Configuration.ChannelPrefix = RedisChannel.Literal("hablamas");
    });
}

var configuredOrigins = new List<string>();
var appBase = builder.Configuration["APP_BASE_URL"];
if (!string.IsNullOrWhiteSpace(appBase))
{
    configuredOrigins.Add(appBase.TrimEnd('/'));
}

configuredOrigins.AddRange([
    "http://localhost:5173",
    "http://localhost:4173",
    "http://localhost:3000"
]);

builder.Services.AddCors(options =>
{
    options.AddPolicy("spa", policy =>
    {
        policy.WithOrigins(configuredOrigins.Distinct().ToArray())
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var uploadPath = app.Configuration["UPLOADS:Path"] ?? "/uploads";
Directory.CreateDirectory(uploadPath);

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadPath),
    RequestPath = "/uploads"
});

app.UseCors("spa");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();

    var seeder = scope.ServiceProvider.GetRequiredService<DatabaseSeeder>();
    await seeder.SeedAsync();
}

app.Run();

static PasskeyOptions ResolvePasskeyOptions(IConfiguration configuration)
{
    var configured = configuration.GetSection(PasskeyOptions.SectionName).Get<PasskeyOptions>() ?? new PasskeyOptions();
    configured.RpName = string.IsNullOrWhiteSpace(configured.RpName) ? "Habla Mas" : configured.RpName.Trim();

    var appBaseUrl = configuration["APP_BASE_URL"]?.TrimEnd('/');
    var configuredOrigins = configured.Origins
        .Where(origin => !string.IsNullOrWhiteSpace(origin))
        .Select(origin => origin.Trim().TrimEnd('/'))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList();

    if (configuredOrigins.Count == 0 && Uri.TryCreate(appBaseUrl, UriKind.Absolute, out var appBaseUri))
    {
        configuredOrigins.Add(appBaseUri.GetLeftPart(UriPartial.Authority));
    }

    if (string.IsNullOrWhiteSpace(configured.RpId))
    {
        if (Uri.TryCreate(appBaseUrl, UriKind.Absolute, out var parsedAppBaseUri))
        {
            configured.RpId = parsedAppBaseUri.Host;
        }
        else
        {
            configured.RpId = "localhost";
        }
    }

    if (configuredOrigins.Count == 0 && string.Equals(configured.RpId, "localhost", StringComparison.OrdinalIgnoreCase))
    {
        configuredOrigins.AddRange([
            "http://localhost:5173",
            "http://localhost:4173",
            "http://localhost:3000",
            "http://localhost:8080"
        ]);
    }

    configured.Origins = configuredOrigins.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    configured.TimeoutMs = configured.TimeoutMs <= 0 ? 60000 : configured.TimeoutMs;
    configured.OperationTtlSeconds = configured.OperationTtlSeconds <= 0 ? 300 : configured.OperationTtlSeconds;
    return configured;
}
