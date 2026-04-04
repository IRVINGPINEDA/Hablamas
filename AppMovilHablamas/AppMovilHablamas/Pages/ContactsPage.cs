using System.Collections.ObjectModel;
using AppMovilHablamas.Models;
using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class ContactsPage : ContentPage
{
    private readonly HablaMasApiClient _apiClient;
    private readonly ObservableCollection<ContactDto> _contacts = [];
    private readonly Entry _codeEntry = new() { Placeholder = "Codigo publico" };
    private readonly CollectionView _collectionView;

    public ContactsPage(HablaMasApiClient apiClient)
    {
        _apiClient = apiClient;
        Title = "Contactos";
        MobileTheme.ApplyPage(this);
        MobileTheme.StyleInput(_codeEntry);

        var addButton = new Button { Text = "Agregar" };
        MobileTheme.StylePrimaryButton(addButton);
        addButton.Clicked += async (_, _) => await AddContactAsync();

        _collectionView = new CollectionView
        {
            ItemsSource = _contacts,
            ItemTemplate = new DataTemplate(() =>
            {
                var name = new Label { FontAttributes = FontAttributes.Bold, FontSize = 16 };
                var code = new Label { FontSize = 12, TextColor = Colors.Gray };
                var aliasEntry = new Entry { Placeholder = "Alias local" };
                var saveButton = new Button { Text = "Guardar alias" };
                MobileTheme.StyleInput(aliasEntry);
                MobileTheme.StyleSecondaryButton(saveButton);

                aliasEntry.BindingContextChanged += (_, _) =>
                {
                    if (aliasEntry.BindingContext is ContactDto contact)
                    {
                        name.Text = string.IsNullOrWhiteSpace(contact.Alias) ? contact.ContactUser.PublicAlias : contact.Alias;
                        code.Text = $"Codigo: {contact.ContactUser.PublicCode}";
                        aliasEntry.Text = contact.Alias;
                        saveButton.CommandParameter = contact;
                    }
                };

                saveButton.Clicked += async (_, _) =>
                {
                    if (saveButton.CommandParameter is ContactDto contact)
                    {
                        await _apiClient.UpdateAliasAsync(contact.Id, aliasEntry.Text ?? string.Empty);
                        await LoadContactsAsync();
                    }
                };

                return MobileTheme.CreateCard(
                    new VerticalStackLayout { Spacing = 6, Children = { name, code, aliasEntry, saveButton } },
                    new Thickness(12),
                    18).WithMargin(new Thickness(0, 0, 0, 10));
            })
        };

        var helperLabel = new Label
        {
            Text = "Agrega personas por codigo y guarda aliases locales.",
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
                            Spacing = 10,
                            Children =
                            {
                                new Label { Text = "Contactos", FontSize = 24, FontAttributes = FontAttributes.Bold },
                                helperLabel,
                                new HorizontalStackLayout { Spacing = 8, Children = { _codeEntry, addButton } }
                            }
                        },
                        new Thickness(18),
                        24),
                    _collectionView
                }
            }
        };
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await LoadContactsAsync();
    }

    private async Task LoadContactsAsync()
    {
        var contacts = await _apiClient.GetContactsAsync();
        _contacts.Clear();
        foreach (var contact in contacts)
        {
            _contacts.Add(contact);
        }
    }

    private async Task AddContactAsync()
    {
        if (string.IsNullOrWhiteSpace(_codeEntry.Text))
        {
            return;
        }

        await _apiClient.AddContactByCodeAsync(_codeEntry.Text.Trim().ToUpperInvariant());
        _codeEntry.Text = string.Empty;
        await LoadContactsAsync();
    }
}
