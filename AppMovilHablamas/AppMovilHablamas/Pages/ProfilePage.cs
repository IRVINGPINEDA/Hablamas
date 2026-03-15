using AppMovilHablamas.Models;
using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class ProfilePage : ContentPage
{
    private readonly HablaMasApiClient _apiClient;
    private readonly AppSession _session;
    private readonly Entry _aliasEntry = new() { Placeholder = "Apodo publico" };
    private readonly Editor _bioEditor = new() { Placeholder = "Bio", AutoSize = EditorAutoSizeOption.TextChanges, MinimumHeightRequest = 100 };
    private readonly Entry _accentEntry = new() { Placeholder = "#1677B3" };
    private readonly Entry _apiUrlEntry = new() { Placeholder = "http://localhost:8080/api" };
    private readonly Picker _themePicker = new() { Title = "Tema" };
    private readonly Label _userCodeLabel = new() { FontSize = 14 };
    private ProfileDto? _profile;

    public ProfilePage(HablaMasApiClient apiClient, AppSession session)
    {
        _apiClient = apiClient;
        _session = session;
        Title = "Perfil";
        MobileTheme.ApplyPage(this);

        _themePicker.ItemsSource = new[] { "Claro", "Oscuro" };
        MobileTheme.StyleInput(_aliasEntry);
        MobileTheme.StyleInput(_bioEditor);
        MobileTheme.StyleInput(_accentEntry);
        MobileTheme.StyleInput(_apiUrlEntry);
        MobileTheme.StyleMutedText(_userCodeLabel);

        var saveButton = new Button { Text = "Guardar perfil" };
        MobileTheme.StylePrimaryButton(saveButton);
        saveButton.Clicked += async (_, _) => await SaveAsync();

        var imageButton = new Button { Text = "Actualizar foto" };
        MobileTheme.StyleSecondaryButton(imageButton);
        imageButton.Clicked += async (_, _) => await UploadImageAsync();

        var serverButton = new Button { Text = "Cambiar servidor" };
        MobileTheme.StyleSecondaryButton(serverButton);
        serverButton.Clicked += async (_, _) =>
        {
            try
            {
                await _session.UpdateApiBaseUrlAsync(_apiUrlEntry.Text ?? string.Empty);
            }
            catch (Exception ex)
            {
                await DisplayAlertAsync("Servidor", ex.Message, "OK");
            }
        };

        var logoutButton = new Button { Text = "Cerrar sesion" };
        MobileTheme.StyleSecondaryButton(logoutButton);
        logoutButton.Clicked += async (_, _) => await _apiClient.LogoutAsync();

        var helperLabel = new Label
        {
            Text = "Cambia alias, apariencia y la direccion de la API cuando necesites apuntar a otro entorno.",
            FontSize = 14
        };
        MobileTheme.StyleMutedText(helperLabel);

        Content = new ScrollView
        {
            Content = new VerticalStackLayout
            {
                Padding = new Thickness(16, 12),
                Spacing = 12,
                Children =
                {
                    MobileTheme.CreateSoftCard(
                        new VerticalStackLayout
                        {
                            Spacing = 6,
                            Children =
                            {
                                new Label { Text = "Perfil y tema", FontSize = 22, FontAttributes = FontAttributes.Bold },
                                helperLabel
                            }
                        },
                        new Thickness(18),
                        24),
                    MobileTheme.CreateCard(
                        new VerticalStackLayout
                        {
                            Spacing = 12,
                            Children =
                            {
                                _userCodeLabel,
                                _aliasEntry,
                                _bioEditor,
                                _themePicker,
                                _accentEntry,
                                saveButton,
                                imageButton
                            }
                        },
                        new Thickness(18),
                        24),
                    MobileTheme.CreateDivider(),
                    new Label { Text = "Servidor API", FontSize = 18, FontAttributes = FontAttributes.Bold },
                    _apiUrlEntry,
                    serverButton,
                    logoutButton
                }
            }
        };
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await LoadAsync();
    }

    private async Task LoadAsync()
    {
        _profile = await _apiClient.GetProfileAsync();
        _aliasEntry.Text = _profile.PublicAlias;
        _bioEditor.Text = _profile.Bio;
        _accentEntry.Text = _profile.AccentColor;
        _themePicker.SelectedIndex = _profile.Theme == 2 ? 1 : 0;
        _apiUrlEntry.Text = _session.ApiBaseUrl;
        _userCodeLabel.Text = $"Codigo: {_profile.PublicCode} - {_profile.Email}";
    }

    private async Task SaveAsync()
    {
        if (_profile is null)
        {
            return;
        }

        _profile.PublicAlias = _aliasEntry.Text?.Trim() ?? _profile.PublicAlias;
        _profile.Bio = _bioEditor.Text?.Trim() ?? string.Empty;
        _profile.AccentColor = string.IsNullOrWhiteSpace(_accentEntry.Text) ? _profile.AccentColor : _accentEntry.Text.Trim();
        _profile.Theme = _themePicker.SelectedIndex == 1 ? 2 : 1;

        await _apiClient.UpdateProfileAsync(_profile);
        await _session.UpdateThemeAsync(_profile.Theme == 2 ? AppTheme.Dark : AppTheme.Light);
        _session.SetCurrentUser(await _apiClient.GetCurrentUserAsync());
        await DisplayAlertAsync("Perfil", "Perfil actualizado.", "OK");
    }

    private async Task UploadImageAsync()
    {
        var file = await FilePicker.Default.PickAsync(new PickOptions
        {
            PickerTitle = "Selecciona una imagen de perfil",
            FileTypes = FilePickerFileType.Images
        });

        if (file is null)
        {
            return;
        }

        await _apiClient.UploadProfileImageAsync(file.FullPath);
        await LoadAsync();
    }
}
