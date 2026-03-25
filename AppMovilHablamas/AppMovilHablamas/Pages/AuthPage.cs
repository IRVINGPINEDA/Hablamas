using AppMovilHablamas.Models;
using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class AuthPage : ContentPage
{
    private readonly HablaMasApiClient _apiClient;
    private readonly Entry _emailEntry = new() { Keyboard = Keyboard.Email, Placeholder = "Correo" };
    private readonly Entry _passwordEntry = new() { IsPassword = true, Placeholder = "Contrasena" };
    private readonly Entry _firstNameEntry = new() { Placeholder = "Nombre" };
    private readonly Entry _lastNameEntry = new() { Placeholder = "Apellidos" };
    private readonly Entry _addressEntry = new() { Placeholder = "Direccion" };
    private readonly Entry _phoneEntry = new() { Placeholder = "Telefono" };
    private readonly Entry _publicAliasEntry = new() { Placeholder = "Apodo publico (opcional)" };
    private readonly Label _modeLabel = new() { FontSize = 26, FontAttributes = FontAttributes.Bold };
    private readonly Label _statusLabel = new() { FontSize = 13, TextColor = Colors.IndianRed };
    private readonly VerticalStackLayout _registerFields;
    private readonly Button _submitButton;
    private bool _registerMode;

    public AuthPage(HablaMasApiClient apiClient)
    {
        _apiClient = apiClient;
        Title = "Habla Mas";
        MobileTheme.ApplyPage(this);

        MobileTheme.StyleInput(_emailEntry);
        MobileTheme.StyleInput(_passwordEntry);
        MobileTheme.StyleInput(_firstNameEntry);
        MobileTheme.StyleInput(_lastNameEntry);
        MobileTheme.StyleInput(_addressEntry);
        MobileTheme.StyleInput(_phoneEntry);
        MobileTheme.StyleInput(_publicAliasEntry);

        _submitButton = new Button();
        _submitButton.Clicked += OnSubmitAsync;
        MobileTheme.StylePrimaryButton(_submitButton);

        _registerFields = new VerticalStackLayout
        {
            Spacing = 10,
            IsVisible = false,
            Children =
            {
                _firstNameEntry,
                _lastNameEntry,
                _addressEntry,
                _phoneEntry,
                _publicAliasEntry
            }
        };

        var loginModeButton = new Button { Text = "Iniciar sesion" };
        loginModeButton.Clicked += (_, _) => SetMode(false);
        MobileTheme.StyleSecondaryButton(loginModeButton);

        var registerModeButton = new Button { Text = "Crear cuenta" };
        registerModeButton.Clicked += (_, _) => SetMode(true);
        MobileTheme.StyleSecondaryButton(registerModeButton);

        var forgotButton = new Button { Text = "Olvide mi contrasena" };
        forgotButton.Clicked += OnForgotPasswordAsync;
        MobileTheme.StyleSecondaryButton(forgotButton);

        var helperLabel = new Label
        {
            Text = "Conectado a la misma API de la version web.",
            FontSize = 14
        };
        MobileTheme.StyleMutedText(helperLabel);

        Content = new ScrollView
        {
            Content = new VerticalStackLayout
            {
                Padding = new Thickness(24, 36),
                Spacing = 18,
                Children =
                {
                    new Label
                    {
                        Text = "Habla Mas movil",
                        FontSize = 14,
                        TextColor = MobileTheme.Accent,
                        FontAttributes = FontAttributes.Bold
                    },
                    new Label
                    {
                        Text = "Tu espacio de chat y chatbot en una sola app",
                        FontSize = 28,
                        FontAttributes = FontAttributes.Bold
                    },
                    MobileTheme.CreateCard(
                        new VerticalStackLayout
                        {
                            Spacing = 14,
                            Children =
                            {
                                _modeLabel,
                                helperLabel,
                                new HorizontalStackLayout
                                {
                                    Spacing = 10,
                                    Children = { loginModeButton, registerModeButton }
                                },
                                _emailEntry,
                                _passwordEntry,
                                _registerFields,
                                _submitButton,
                                forgotButton,
                                _statusLabel
                            }
                        },
                        new Thickness(22),
                        28)
                }
            }
        };

        SetMode(false);
    }

    private void SetMode(bool registerMode)
    {
        _registerMode = registerMode;
        _registerFields.IsVisible = registerMode;
        _passwordEntry.IsVisible = !registerMode;
        _modeLabel.Text = registerMode ? "Crea tu cuenta" : "Bienvenido";
        _submitButton.Text = registerMode ? "Registrar usuario" : "Entrar";
        _statusLabel.Text = string.Empty;
    }

    private async void OnSubmitAsync(object? sender, EventArgs e)
    {
        _submitButton.IsEnabled = false;
        _statusLabel.Text = string.Empty;

        try
        {
            if (_registerMode)
            {
                await _apiClient.RegisterAsync(new RegisterRequestDto
                {
                    FirstName = _firstNameEntry.Text?.Trim() ?? string.Empty,
                    LastName = _lastNameEntry.Text?.Trim() ?? string.Empty,
                    Email = _emailEntry.Text?.Trim() ?? string.Empty,
                    Address = _addressEntry.Text?.Trim() ?? string.Empty,
                    Phone = _phoneEntry.Text?.Trim() ?? string.Empty,
                    PublicAlias = string.IsNullOrWhiteSpace(_publicAliasEntry.Text) ? null : _publicAliasEntry.Text.Trim()
                });

                await DisplayAlertAsync("Cuenta creada", "Revisa tu correo para la contrasena temporal y la verificacion.", "OK");
                SetMode(false);
                return;
            }

            var payload = await _apiClient.LoginAsync(_emailEntry.Text?.Trim() ?? string.Empty, _passwordEntry.Text ?? string.Empty);
            if (!payload.EmailConfirmed)
            {
                await DisplayAlertAsync("Correo pendiente", "Tu cuenta inicio sesion, pero aun falta verificar el correo.", "OK");
            }
        }
        catch (Exception ex)
        {
            _statusLabel.Text = ex.Message;
        }
        finally
        {
            _submitButton.IsEnabled = true;
        }
    }

    private async void OnForgotPasswordAsync(object? sender, EventArgs e)
    {
        try
        {
            await _apiClient.ForgotPasswordAsync(_emailEntry.Text?.Trim() ?? string.Empty);
            await DisplayAlertAsync("Recuperacion", "Si el correo existe, se envio un enlace de recuperacion.", "OK");
        }
        catch (Exception ex)
        {
            _statusLabel.Text = ex.Message;
        }
    }
}
