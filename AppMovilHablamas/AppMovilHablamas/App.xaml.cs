using AppMovilHablamas.Pages;
using AppMovilHablamas.Services;

namespace AppMovilHablamas;

public partial class App : Application
{
    private readonly IServiceProvider _serviceProvider;
    private readonly AppSession _session;
    private readonly HablaMasApiClient _apiClient;
    private Window? _window;

    public App(IServiceProvider serviceProvider, AppSession session, HablaMasApiClient apiClient)
    {
        InitializeComponent();
        _serviceProvider = serviceProvider;
        _session = session;
        _apiClient = apiClient;
        _session.SessionChanged += async (_, _) => await MainThread.InvokeOnMainThreadAsync(UpdateRootPage);
    }

    protected override Window CreateWindow(IActivationState? activationState)
    {
        _window = new Window(new ContentPage
        {
            Content = new Grid
            {
                Children =
                {
                    new ActivityIndicator
                    {
                        IsRunning = true,
                        VerticalOptions = LayoutOptions.Center,
                        HorizontalOptions = LayoutOptions.Center
                    }
                }
            }
        });

        _ = InitializeAsync();
        return _window;
    }

    private async Task InitializeAsync()
    {
        await _session.InitializeAsync(_apiClient);
        await MainThread.InvokeOnMainThreadAsync(UpdateRootPage);
    }

    private void UpdateRootPage()
    {
        if (_window is null)
        {
            return;
        }

        Page rootPage = !_session.IsAuthenticated
            ? _serviceProvider.GetRequiredService<AuthPage>()
            : !_session.CurrentUser!.EmailConfirmed
                ? _serviceProvider.GetRequiredService<VerificationPendingPage>()
                : _session.CurrentUser.MustChangePassword
                    ? _serviceProvider.GetRequiredService<ChangePasswordPage>()
                    : _serviceProvider.GetRequiredService<AppShell>();

        _window.Page = rootPage is TabbedPage ? rootPage : new NavigationPage(rootPage);
    }
}
