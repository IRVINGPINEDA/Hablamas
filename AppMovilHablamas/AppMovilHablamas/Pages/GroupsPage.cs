using System.Collections.ObjectModel;
using AppMovilHablamas.Models;
using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class GroupsPage : ContentPage
{
    private readonly HablaMasApiClient _apiClient;
    private readonly ObservableCollection<GroupSummaryDto> _groups = [];
    private readonly ObservableCollection<SelectableContact> _contacts = [];
    private readonly Entry _groupNameEntry = new() { Placeholder = "Nombre del grupo" };
    private readonly CollectionView _groupList;
    private readonly CollectionView _contactList;

    public GroupsPage(HablaMasApiClient apiClient)
    {
        _apiClient = apiClient;
        Title = "Grupos";
        MobileTheme.ApplyPage(this);
        MobileTheme.StyleInput(_groupNameEntry);

        var createButton = new Button { Text = "Crear grupo" };
        MobileTheme.StylePrimaryButton(createButton);
        createButton.Clicked += async (_, _) => await CreateGroupAsync();

        _contactList = new CollectionView
        {
            HeightRequest = 180,
            ItemsSource = _contacts,
            ItemTemplate = new DataTemplate(() =>
            {
                var check = new CheckBox();
                check.SetBinding(CheckBox.IsCheckedProperty, nameof(SelectableContact.IsSelected));
                var label = new Label { VerticalOptions = LayoutOptions.Center };
                label.SetBinding(Label.TextProperty, nameof(SelectableContact.DisplayName));
                return new HorizontalStackLayout { Spacing = 8, Children = { check, label } };
            })
        };

        _groupList = new CollectionView
        {
            ItemsSource = _groups,
            SelectionMode = SelectionMode.Single,
            ItemTemplate = new DataTemplate(() =>
            {
                var title = new Label { FontAttributes = FontAttributes.Bold, FontSize = 16 };
                title.SetBinding(Label.TextProperty, nameof(GroupSummaryDto.Name));

                var meta = new Label { FontSize = 13, TextColor = Colors.Gray };
                meta.BindingContextChanged += (_, _) =>
                {
                    if (meta.BindingContext is GroupSummaryDto item)
                    {
                        meta.Text = item.LastMessage?.Type == "image" ? "[imagen]" : item.LastMessage?.Text ?? "Sin mensajes";
                    }
                };

                return MobileTheme.CreateCard(
                    new VerticalStackLayout { Spacing = 4, Children = { title, meta } },
                    new Thickness(14),
                    18).WithMargin(new Thickness(0, 0, 0, 10));
            })
        };
        _groupList.SelectionChanged += async (_, e) =>
        {
            if (e.CurrentSelection.FirstOrDefault() is GroupSummaryDto item)
            {
                _groupList.SelectedItem = null;
                await Navigation.PushAsync(new GroupChatPage(_apiClient, item));
            }
        };

        var helperLabel = new Label
        {
            Text = "Selecciona miembros y crea grupos con el mismo backend que usa la web.",
            FontSize = 14
        };
        MobileTheme.StyleMutedText(helperLabel);

        Content = new ScrollView
        {
            Content = new VerticalStackLayout
            {
                Padding = new Thickness(16, 12),
                Spacing = 14,
                Children =
                {
                    MobileTheme.CreateSoftCard(
                        new VerticalStackLayout
                        {
                            Spacing = 14,
                            Children =
                            {
                                new Label { Text = "Crear grupo", FontSize = 22, FontAttributes = FontAttributes.Bold },
                                helperLabel,
                                _groupNameEntry,
                                _contactList,
                                createButton
                            }
                        },
                        new Thickness(18),
                        24),
                    MobileTheme.CreateDivider(),
                    new Label { Text = "Tus grupos", FontSize = 20, FontAttributes = FontAttributes.Bold },
                    _groupList
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
        var groups = await _apiClient.GetGroupsAsync();
        var contacts = await _apiClient.GetContactsAsync();

        _groups.Clear();
        foreach (var group in groups)
        {
            _groups.Add(group);
        }

        _contacts.Clear();
        foreach (var contact in contacts)
        {
            _contacts.Add(new SelectableContact(contact));
        }
    }

    private async Task CreateGroupAsync()
    {
        var selected = _contacts.Where(item => item.IsSelected).Select(item => item.UserId).ToArray();
        if (string.IsNullOrWhiteSpace(_groupNameEntry.Text) || selected.Length == 0)
        {
            await DisplayAlertAsync("Grupo", "Define nombre y al menos un miembro.", "OK");
            return;
        }

        await _apiClient.CreateGroupAsync(_groupNameEntry.Text.Trim(), selected);
        _groupNameEntry.Text = string.Empty;
        foreach (var item in _contacts)
        {
            item.IsSelected = false;
        }

        await LoadAsync();
    }

    private sealed class SelectableContact : BindableObject
    {
        private bool _isSelected;

        public SelectableContact(ContactDto contact)
        {
            UserId = contact.ContactUser.Id;
            DisplayName = string.IsNullOrWhiteSpace(contact.Alias) ? contact.ContactUser.PublicAlias : contact.Alias!;
        }

        public Guid UserId { get; }

        public string DisplayName { get; }

        public bool IsSelected
        {
            get => _isSelected;
            set
            {
                _isSelected = value;
                OnPropertyChanged();
            }
        }
    }
}
