using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class VerificationPendingPage : ContentPage
{
    public VerificationPendingPage(HablaMasApiClient apiClient, AppSession session)
    {
        Title = "Verifica tu correo";
        MobileTheme.ApplyPage(this);

        var statusLabel = new Label
        {
            FontSize = 14,
            Text = "Debes verificar tu correo antes de usar el chat."
        };
        MobileTheme.StyleMutedText(statusLabel);

        var resendButton = new Button { Text = "Reenviar verificacion" };
        MobileTheme.StylePrimaryButton(resendButton);
        resendButton.Clicked += async (_, _) =>
        {
            try
            {
                await apiClient.ResendVerificationAsync(session.CurrentUser?.Email ?? string.Empty);
                await DisplayAlertAsync("Correo enviado", "Se reenvio el enlace de verificacion.", "OK");
            }
            catch (Exception ex)
            {
                statusLabel.Text = ex.Message;
            }
        };

        var refreshButton = new Button { Text = "Ya verifique mi correo" };
        MobileTheme.StyleSecondaryButton(refreshButton);
        refreshButton.Clicked += async (_, _) =>
        {
            try
            {
                session.SetCurrentUser(await apiClient.GetCurrentUserAsync());
            }
            catch (Exception ex)
            {
                statusLabel.Text = ex.Message;
            }
        };

        var logoutButton = new Button { Text = "Cerrar sesion" };
        MobileTheme.StyleSecondaryButton(logoutButton);
        logoutButton.Clicked += async (_, _) => await apiClient.LogoutAsync();

        Content = new ScrollView
        {
            Content = new VerticalStackLayout
            {
                Padding = new Thickness(24, 36),
                Spacing = 14,
                Children =
                {
                    new Label { Text = "Correo pendiente", FontSize = 28, FontAttributes = FontAttributes.Bold },
                    MobileTheme.CreateCard(
                        new VerticalStackLayout
                        {
                            Spacing = 14,
                            Children =
                            {
                                new Label { Text = session.CurrentUser?.Email ?? string.Empty, FontSize = 16, FontAttributes = FontAttributes.Bold },
                                statusLabel,
                                resendButton,
                                refreshButton,
                                logoutButton
                            }
                        })
                }
            }
        };
    }
}
