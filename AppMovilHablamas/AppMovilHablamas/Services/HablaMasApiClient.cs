using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using AppMovilHablamas.Models;

namespace AppMovilHablamas.Services;

public sealed class HablaMasApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient = new();
    private readonly AppSession _session;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    public HablaMasApiClient(AppSession session)
    {
        _session = session;
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
    }

    public async Task<AuthPayloadDto> LoginAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        var payload = await SendAsync<AuthPayloadDto>(HttpMethod.Post, "/auth/login", new { email, password }, allowRefresh: false, cancellationToken: cancellationToken);
        await _session.SetTokensAsync(payload);
        _session.SetCurrentUser(await GetCurrentUserAsync(cancellationToken));
        return payload;
    }

    public Task RegisterAsync(RegisterRequestDto request, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Post, "/auth/register", request, allowRefresh: false, cancellationToken: cancellationToken);

    public Task ForgotPasswordAsync(string email, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Post, "/auth/forgot-password", new { email }, allowRefresh: false, cancellationToken: cancellationToken);

    public Task ResendVerificationAsync(string email, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Post, "/auth/resend-verification", new { email }, allowRefresh: false, cancellationToken: cancellationToken);

    public Task ChangeTemporaryPasswordAsync(string currentPassword, string newPassword, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Post, "/auth/change-temporary-password", new { currentPassword, newPassword }, cancellationToken: cancellationToken);

    public async Task LogoutAsync(CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(_session.RefreshToken))
        {
            try
            {
                await SendAsync<object>(HttpMethod.Post, "/auth/logout", new { refreshToken = _session.RefreshToken }, cancellationToken: cancellationToken);
            }
            catch
            {
                // best effort
            }
        }

        await _session.SignOutAsync();
    }

    public Task<MobileUserDto> GetCurrentUserAsync(CancellationToken cancellationToken = default)
        => SendAsync<MobileUserDto>(HttpMethod.Get, "/auth/me", cancellationToken: cancellationToken);

    public Task<ProfileDto> GetProfileAsync(CancellationToken cancellationToken = default)
        => SendAsync<ProfileDto>(HttpMethod.Get, "/profile/me", cancellationToken: cancellationToken);

    public Task UpdateProfileAsync(ProfileDto profile, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Put, "/profile/me", new
        {
            bio = profile.Bio,
            publicAlias = profile.PublicAlias,
            theme = profile.Theme,
            accentColor = profile.AccentColor
        }, cancellationToken: cancellationToken);

    public Task<UploadResponseDto> UploadProfileImageAsync(string filePath, CancellationToken cancellationToken = default)
        => UploadImageAsync("/profile/image", filePath, cancellationToken);

    public Task<List<ConversationSummaryDto>> GetChatsAsync(CancellationToken cancellationToken = default)
        => SendAsync<List<ConversationSummaryDto>>(HttpMethod.Get, "/chats", cancellationToken: cancellationToken);

    public Task<PagedResponseDto<MessageDto>> GetMessagesAsync(Guid conversationId, CancellationToken cancellationToken = default)
        => SendAsync<PagedResponseDto<MessageDto>>(HttpMethod.Get, $"/chats/{conversationId}/messages?page=1&pageSize=80", cancellationToken: cancellationToken);

    public Task MarkSeenAsync(Guid conversationId, Guid? lastSeenMessageId, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Post, $"/chats/{conversationId}/mark-seen", new { lastSeenMessageId }, cancellationToken: cancellationToken);

    public Task<List<ContactDto>> GetContactsAsync(CancellationToken cancellationToken = default)
        => SendAsync<List<ContactDto>>(HttpMethod.Get, "/contacts", cancellationToken: cancellationToken);

    public Task<AddContactResponseDto> AddContactByCodeAsync(string publicCode, CancellationToken cancellationToken = default)
        => SendAsync<AddContactResponseDto>(HttpMethod.Post, "/contacts/add-by-code", new { publicCode }, cancellationToken: cancellationToken);

    public Task UpdateAliasAsync(Guid contactId, string alias, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Patch, $"/contacts/{contactId}/alias", new { alias }, cancellationToken: cancellationToken);

    public Task<List<GroupSummaryDto>> GetGroupsAsync(CancellationToken cancellationToken = default)
        => SendAsync<List<GroupSummaryDto>>(HttpMethod.Get, "/group-chats", cancellationToken: cancellationToken);

    public Task<GroupSummaryDto> CreateGroupAsync(string name, IEnumerable<Guid> memberUserIds, CancellationToken cancellationToken = default)
        => SendAsync<GroupSummaryDto>(HttpMethod.Post, "/group-chats", new { name, memberUserIds = memberUserIds.ToArray() }, cancellationToken: cancellationToken);

    public Task<List<GroupMemberDto>> GetGroupMembersAsync(Guid groupId, CancellationToken cancellationToken = default)
        => SendAsync<List<GroupMemberDto>>(HttpMethod.Get, $"/group-chats/{groupId}/members", cancellationToken: cancellationToken);

    public Task<PagedResponseDto<GroupMessageDto>> GetGroupMessagesAsync(Guid groupId, CancellationToken cancellationToken = default)
        => SendAsync<PagedResponseDto<GroupMessageDto>>(HttpMethod.Get, $"/group-chats/{groupId}/messages?page=1&pageSize=100", cancellationToken: cancellationToken);

    public Task SendGroupTextAsync(Guid groupId, string text, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Post, $"/group-chats/{groupId}/messages", new
        {
            type = "text",
            text,
            clientMessageId = Guid.NewGuid().ToString()
        }, cancellationToken: cancellationToken);

    public Task SendGroupImageAsync(Guid groupId, string imageUrl, CancellationToken cancellationToken = default)
        => SendAsync<object>(HttpMethod.Post, $"/group-chats/{groupId}/messages", new
        {
            type = "image",
            imageUrl,
            clientMessageId = Guid.NewGuid().ToString()
        }, cancellationToken: cancellationToken);

    public Task<UploadResponseDto> UploadMessageImageAsync(string filePath, CancellationToken cancellationToken = default)
        => UploadImageAsync("/uploads/message-image", filePath, cancellationToken);

    public Task<ChatbotReplyDto> SendChatbotMessageAsync(string message, IEnumerable<ChatbotHistoryItemDto> history, IEnumerable<ChatbotImageDto> images, CancellationToken cancellationToken = default)
        => SendAsync<ChatbotReplyDto>(HttpMethod.Post, "/chatbot/message", new { message, history, images }, cancellationToken: cancellationToken);

    private async Task<UploadResponseDto> UploadImageAsync(string relativeUrl, string filePath, CancellationToken cancellationToken)
    {
        using var content = new MultipartFormDataContent();
        await using var stream = File.OpenRead(filePath);
        using var fileContent = new StreamContent(stream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(GetContentType(filePath));
        content.Add(fileContent, "file", System.IO.Path.GetFileName(filePath));

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUri(relativeUrl));
        if (!string.IsNullOrWhiteSpace(_session.AccessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _session.AccessToken);
        }

        request.Content = content;
        using var response = await SendRequestAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized && await TryRefreshTokenAsync(cancellationToken))
        {
            return await UploadImageAsync(relativeUrl, filePath, cancellationToken);
        }

        await EnsureSuccessAsync(response, cancellationToken);
        return (await response.Content.ReadFromJsonAsync<UploadResponseDto>(JsonOptions, cancellationToken))!;
    }

    private async Task<T> SendAsync<T>(HttpMethod method, string relativeUrl, object? body = null, bool allowRefresh = true, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(method, BuildUri(relativeUrl));
        if (!string.IsNullOrWhiteSpace(_session.AccessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _session.AccessToken);
        }

        if (body is not null)
        {
            request.Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json");
        }

        using var response = await SendRequestAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized && allowRefresh && await TryRefreshTokenAsync(cancellationToken))
        {
            return await SendAsync<T>(method, relativeUrl, body, allowRefresh: false, cancellationToken);
        }

        await EnsureSuccessAsync(response, cancellationToken);
        if (typeof(T) == typeof(object))
        {
            return default!;
        }

        return (await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken))!;
    }

    private async Task<bool> TryRefreshTokenAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_session.RefreshToken))
        {
            return false;
        }

        await _refreshLock.WaitAsync(cancellationToken);
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, BuildUri("/auth/refresh"))
            {
                Content = new StringContent(JsonSerializer.Serialize(new { refreshToken = _session.RefreshToken }, JsonOptions), Encoding.UTF8, "application/json")
            };

            using var response = await SendRequestAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                await _session.SignOutAsync();
                return false;
            }

            var payload = (await response.Content.ReadFromJsonAsync<AuthPayloadDto>(JsonOptions, cancellationToken))!;
            await _session.SetTokensAsync(payload);
            _session.SetCurrentUser(await GetCurrentUserAsync(cancellationToken));
            return true;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private Uri BuildUri(string relativeUrl)
        => new($"{_session.ApiBaseUrl.TrimEnd('/')}{relativeUrl}");

    private async Task<HttpResponseMessage> SendRequestAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        try
        {
            return await _httpClient.SendAsync(request, cancellationToken);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException(
                $"No se pudo conectar a {_session.ApiBaseUrl}. Si usas un telefono fisico, no sirve localhost ni 10.0.2.2; usa la IP LAN de tu PC o {AppSessionDefaultApiHint()}.",
                ex);
        }
        catch (HttpRequestException ex)
        {
            throw new InvalidOperationException(
                $"No se pudo conectar a {_session.ApiBaseUrl}. Verifica la direccion del servidor y que el telefono este en la misma red o usa {AppSessionDefaultApiHint()}.",
                ex);
        }
    }

    private static string AppSessionDefaultApiHint() => "https://caleiro.online/api";

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        try
        {
            var problem = JsonSerializer.Deserialize<ProblemDetailsDto>(raw, JsonOptions);
            var fieldErrors = problem?.Errors?.SelectMany(item => item.Value).Where(value => !string.IsNullOrWhiteSpace(value)).ToArray();
            if (fieldErrors is { Length: > 0 })
            {
                throw new InvalidOperationException(string.Join(Environment.NewLine, fieldErrors));
            }

            throw new InvalidOperationException(problem?.Detail ?? problem?.Title ?? $"Error {(int)response.StatusCode}");
        }
        catch (JsonException)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(raw) ? $"Error {(int)response.StatusCode}" : raw);
        }
    }

    private static string GetContentType(string filePath)
    {
        return System.IO.Path.GetExtension(filePath).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg"
        };
    }
}
