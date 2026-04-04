using System.Collections.ObjectModel;
using AppMovilHablamas.Models;
using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class ChatsPage : ContentPage
{
    private readonly HablaMasApiClient _apiClient;
    private readonly ChatRealtimeService _realtimeService;
    private readonly AppSession _session;
    private readonly ObservableCollection<ConversationSummaryDto> _conversations = [];
    private readonly CollectionView _collectionView;
    private readonly RefreshView _refreshView;

    public ChatsPage(HablaMasApiClient apiClient, ChatRealtimeService realtimeService, AppSession session)
    {
        _apiClient = apiClient;
        _realtimeService = realtimeService;
        _session = session;
        Title = "Chats";
        MobileTheme.ApplyPage(this);

        _collectionView = new CollectionView
        {
            ItemsSource = _conversations,
            SelectionMode = SelectionMode.Single,
            ItemTemplate = new DataTemplate(() =>
            {
                var aliasLabel = new Label { FontAttributes = FontAttributes.Bold, FontSize = 16 };
                var messageLabel = new Label { FontSize = 13, TextColor = Colors.Gray };
                var statusDot = new BoxView { WidthRequest = 10, HeightRequest = 10, CornerRadius = 5, HorizontalOptions = LayoutOptions.End };

                aliasLabel.BindingContextChanged += (_, _) =>
                {
                    if (aliasLabel.BindingContext is ConversationSummaryDto item)
                    {
                        aliasLabel.Text = string.IsNullOrWhiteSpace(item.Contact.Alias) ? item.Contact.PublicAlias : item.Contact.Alias;
                        messageLabel.Text = item.LastMessage?.Type == "image" ? "[imagen]" : item.LastMessage?.Text ?? "Sin mensajes";
                        statusDot.Color = _realtimeService.IsOnline(item.Contact.Id) ? Colors.LimeGreen : Colors.LightGray;
                    }
                };

                return MobileTheme.CreateCard(CreateConversationLayout(aliasLabel, messageLabel, statusDot), new Thickness(14), 18)
                    .WithMargin(new Thickness(0, 0, 0, 10));
            })
        };
        _collectionView.SelectionChanged += OnConversationSelected;

        _refreshView = new RefreshView { Content = _collectionView };
        _refreshView.Refreshing += async (_, _) => await LoadChatsAsync();

        ToolbarItems.Add(new ToolbarItem("Refrescar", null, async () => await LoadChatsAsync()));

        var heroLabel = new Label
        {
            Text = "Tu lista principal de chats directos con presencia en tiempo real.",
            FontSize = 14
        };
        MobileTheme.StyleMutedText(heroLabel);

        var hero = MobileTheme.CreateSoftCard(
            new VerticalStackLayout
            {
                Spacing = 6,
                Children =
                {
                    new Label { Text = "Conversaciones", FontSize = 26, FontAttributes = FontAttributes.Bold },
                    heroLabel
                }
            },
            new Thickness(18),
            24);

        var layout = new Grid
        {
            Padding = new Thickness(16, 12),
            RowDefinitions =
            {
                new RowDefinition(GridLength.Auto),
                new RowDefinition(GridLength.Star)
            }
        };
        layout.Add(hero);
        layout.Add(_refreshView);
        _refreshView.SetValue(Grid.RowProperty, 1);
        Content = layout;

        _realtimeService.PresenceUpdated += OnPresenceUpdated;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _realtimeService.EnsureConnectedAsync();
        await LoadChatsAsync();
    }

    private static Grid CreateConversationLayout(Label aliasLabel, Label messageLabel, BoxView statusDot)
    {
        var grid = new Grid
        {
            ColumnDefinitions =
            {
                new ColumnDefinition(GridLength.Star),
                new ColumnDefinition(GridLength.Auto)
            }
        };

        var content = new VerticalStackLayout
        {
            Spacing = 4,
            Children = { aliasLabel, messageLabel }
        };

        grid.Add(content);
        grid.Add(statusDot);
        statusDot.SetValue(Grid.ColumnProperty, 1);
        return grid;
    }

    private async Task LoadChatsAsync()
    {
        try
        {
            _refreshView.IsRefreshing = true;
            var chats = await _apiClient.GetChatsAsync();
            _conversations.Clear();
            foreach (var item in chats)
            {
                _conversations.Add(item);
            }
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync("Chats", ex.Message, "OK");
        }
        finally
        {
            _refreshView.IsRefreshing = false;
        }
    }

    private async void OnConversationSelected(object? sender, SelectionChangedEventArgs e)
    {
        if (e.CurrentSelection.FirstOrDefault() is not ConversationSummaryDto conversation)
        {
            return;
        }

        _collectionView.SelectedItem = null;
        await Navigation.PushAsync(new DirectChatPage(_apiClient, _realtimeService, _session, conversation));
    }

    private void OnPresenceUpdated(object? sender, HubPresenceDto e)
    {
        MainThread.BeginInvokeOnMainThread(() => _collectionView.ItemsSource = null);
        MainThread.BeginInvokeOnMainThread(() => _collectionView.ItemsSource = _conversations);
    }
}

internal static class ViewExtensions
{
    public static T WithMargin<T>(this T view, Thickness margin) where T : View
    {
        view.Margin = margin;
        return view;
    }
}
