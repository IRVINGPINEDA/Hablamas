using AppMovilHablamas.Pages;
using AppMovilHablamas.Services;
using Microsoft.Extensions.Logging;

namespace AppMovilHablamas;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");   
                fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
            });

        builder.Services.AddSingleton<AppSession>();
        builder.Services.AddSingleton<HablaMasApiClient>();
        builder.Services.AddSingleton<ChatRealtimeService>();

        builder.Services.AddTransient<AuthPage>();
        builder.Services.AddTransient<VerificationPendingPage>();
        builder.Services.AddTransient<ChangePasswordPage>();
        builder.Services.AddTransient<AppShell>();
        builder.Services.AddSingleton<ChatsPage>();
        builder.Services.AddSingleton<GroupsPage>();
        builder.Services.AddSingleton<ContactsPage>();
        builder.Services.AddSingleton<MobileChatbotPage>();
        builder.Services.AddSingleton<ProfilePage>();

#if DEBUG
        builder.Logging.AddDebug();
#endif

        return builder.Build();
    }
}
