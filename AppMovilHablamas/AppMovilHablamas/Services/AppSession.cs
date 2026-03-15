using System.ComponentModel;
using System.Runtime.CompilerServices;
using AppMovilHablamas.Models;
using Microsoft.Maui.Storage;

namespace AppMovilHablamas.Services;

public sealed class AppSession : INotifyPropertyChanged
{
    private const string AccessTokenKey = "hablamas_mobile_access_token";
    private const string RefreshTokenKey = "hablamas_mobile_refresh_token";
    private const string ApiBaseUrlKey = "hablamas_mobile_api_base_url";
    private const string ThemeKey = "hablamas_mobile_theme";

    private MobileUserDto? _currentUser;
    private string? _accessToken;
    private string? _refreshToken;
    private string _apiBaseUrl;
    private AppTheme _themePreference;

    public AppSession()
    {
        _apiBaseUrl = Preferences.Default.Get(ApiBaseUrlKey, GetDefaultApiBaseUrl());
        _themePreference = (AppTheme)Preferences.Default.Get(ThemeKey, (int)AppTheme.Light);
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    public event EventHandler? SessionChanged;

    public MobileUserDto? CurrentUser
    {
        get => _currentUser;
        private set
        {
            _currentUser = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsAuthenticated));
        }
    }

    public bool IsAuthenticated => !string.IsNullOrWhiteSpace(_accessToken) && CurrentUser is not null;

    public string? AccessToken => _accessToken;

    public string? RefreshToken => _refreshToken;

    public string ApiBaseUrl
    {
        get => _apiBaseUrl;
        private set
        {
            _apiBaseUrl = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HubUrl));
        }
    }

    public string HubUrl => $"{ApiBaseUrl.TrimEnd('/').Replace("/api", string.Empty, StringComparison.OrdinalIgnoreCase)}/hubs/chat";

    public AppTheme ThemePreference
    {
        get => _themePreference;
        private set
        {
            _themePreference = value;
            OnPropertyChanged();
        }
    }

    public async Task InitializeAsync(HablaMasApiClient apiClient, CancellationToken cancellationToken = default)
    {
        _accessToken = await SecureStorage.Default.GetAsync(AccessTokenKey);
        _refreshToken = await SecureStorage.Default.GetAsync(RefreshTokenKey);

        ApplyTheme();

        if (string.IsNullOrWhiteSpace(_accessToken))
        {
            RaiseSessionChanged();
            return;
        }

        try
        {
            CurrentUser = await apiClient.GetCurrentUserAsync(cancellationToken);
        }
        catch
        {
            await SignOutAsync();
            return;
        }

        RaiseSessionChanged();
    }

    public async Task SetTokensAsync(AuthPayloadDto payload)
    {
        _accessToken = payload.AccessToken;
        _refreshToken = payload.RefreshToken;
        await SecureStorage.Default.SetAsync(AccessTokenKey, payload.AccessToken);
        await SecureStorage.Default.SetAsync(RefreshTokenKey, payload.RefreshToken);
        OnPropertyChanged(nameof(AccessToken));
        OnPropertyChanged(nameof(RefreshToken));
    }

    public void SetCurrentUser(MobileUserDto user)
    {
        CurrentUser = user;
        RaiseSessionChanged();
    }

    public async Task UpdateApiBaseUrlAsync(string baseUrl)
    {
        ApiBaseUrl = NormalizeApiBaseUrl(baseUrl);
        Preferences.Default.Set(ApiBaseUrlKey, ApiBaseUrl);
        await SignOutAsync(clearApiBaseUrl: false);
    }

    public Task UpdateThemeAsync(AppTheme theme)
    {
        ThemePreference = theme;
        Preferences.Default.Set(ThemeKey, (int)theme);
        ApplyTheme();
        RaiseSessionChanged();
        return Task.CompletedTask;
    }

    public void ApplyTheme()
    {
        Application.Current!.UserAppTheme = ThemePreference;
    }

    public async Task SignOutAsync(bool clearApiBaseUrl = false)
    {
        CurrentUser = null;
        _accessToken = null;
        _refreshToken = null;
        SecureStorage.Default.Remove(AccessTokenKey);
        SecureStorage.Default.Remove(RefreshTokenKey);
        OnPropertyChanged(nameof(AccessToken));
        OnPropertyChanged(nameof(RefreshToken));

        if (clearApiBaseUrl)
        {
            ApiBaseUrl = GetDefaultApiBaseUrl();
            Preferences.Default.Set(ApiBaseUrlKey, ApiBaseUrl);
        }

        RaiseSessionChanged();
        await Task.CompletedTask;
    }

    public string GetDisplayName() => CurrentUser?.PublicAlias ?? CurrentUser?.Email ?? "Habla Mas";

    private static string NormalizeApiBaseUrl(string baseUrl)
    {
        var value = baseUrl.Trim();
        if (!value.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
        {
            value = $"{value.TrimEnd('/')}/api";
        }

        return value;
    }

    private static string GetDefaultApiBaseUrl()
    {
        return DeviceInfo.Platform == DevicePlatform.Android
            ? "http://10.0.2.2:8080/api"
            : "http://localhost:8080/api";
    }

    private void RaiseSessionChanged() => SessionChanged?.Invoke(this, EventArgs.Empty);

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
}
