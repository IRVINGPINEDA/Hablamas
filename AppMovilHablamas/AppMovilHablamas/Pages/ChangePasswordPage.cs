using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class ChangePasswordPage : ContentPage
{
    public ChangePasswordPage(HablaMasApiClient apiClient, AppSession session)
    {
        Title = "Cambiar contrasena";
        MobileTheme.ApplyPage(this);

        var currentEntry = new Entry { Placeholder = "Contrasena actual", IsPassword = true };
        var newEntry = new Entry { Placeholder = "Nueva contrasena", IsPassword = true };
        var confirmEntry = new Entry { Placeholder = "Confirmar nueva contrasena", IsPassword = true };
        var statusLabel = new Label { FontSize = 13, TextColor = Colors.IndianRed };
        var submitButton = new Button { Text = "Actualizar contrasena" };

        MobileTheme.StyleInput(currentEntry);
        MobileTheme.StyleInput(newEntry);
        MobileTheme.StyleInput(confirmEntry);
        MobileTheme.StylePrimaryButton(submitButton);

        submitButton.Clicked += async (_, _) =>
        {
            statusLabel.Text = string.Empty;
            if (newEntry.Text != confirmEntry.Text)
            {
                statusLabel.Text = "La nueva contrasena no coincide.";
                return;
            }

            try
            {
                await apiClient.ChangeTemporaryPasswordAsync(currentEntry.Text ?? string.Empty, newEntry.Text ?? string.Empty);
                session.SetCurrentUser(await apiClient.GetCurrentUserAsync());
                await DisplayAlertAsync("Contrasena actualizada", "Ya puedes entrar al flujo principal del chat.", "OK");
            }
            catch (Exception ex)
            {
                statusLabel.Text = ex.Message;
            }
        };

        var helperLabel = new Label
        {
            Text = "Necesitas cambiarla antes de usar chats, grupos y chatbot.",
            FontSize = 14
        };
        MobileTheme.StyleMutedText(helperLabel);

        Content = new ScrollView
        {
            Content = new VerticalStackLayout
            {
                Padding = new Thickness(24, 36),
                Spacing = 12,
                Children =
                {
                    new Label { Text = "Actualiza tu contrasena temporal", FontSize = 26, FontAttributes = FontAttributes.Bold },
                    MobileTheme.CreateCard(
                        new VerticalStackLayout
                        {
                            Spacing = 12,
                            Children =
                            {
                                helperLabel,
                                currentEntry,
                                newEntry,
                                confirmEntry,
                                submitButton,
                                statusLabel
                            }
                        })
                }
            }
        };
    }
}
