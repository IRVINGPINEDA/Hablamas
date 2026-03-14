using System.Collections.ObjectModel;
using AppMovilHablamas.Models;
using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class GroupChatPage : ContentPage
{
    private readonly HablaMasApiClient _apiClient;
    private readonly GroupSummaryDto _group;
    private readonly ObservableCollection<GroupMessageDto> _messages = [];
    private readonly CollectionView _collectionView;
    private readonly Entry _messageEntry = new() { Placeholder = "Escribe al grupo" };
    private IDispatcherTimer? _timer;

    public GroupChatPage(HablaMasApiClient apiClient, GroupSummaryDto group)
    {
        _apiClient = apiClient;
        _group = group;
        Title = group.Name;
        MobileTheme.ApplyPage(this);
        MobileTheme.StyleInput(_messageEntry);

        _collectionView = new CollectionView
        {
            ItemsSource = _messages,
            ItemTemplate = new DataTemplate(() =>
            {
                var sender = new Label { FontSize = 12, FontAttributes = FontAttributes.Bold, TextColor = Color.FromArgb("#5f7888") };
                sender.SetBinding(Label.TextProperty, nameof(GroupMessageDto.SenderAlias));

                var text = new Label { LineBreakMode = LineBreakMode.WordWrap };
                text.SetBinding(Label.TextProperty, nameof(GroupMessageDto.Text));

                var image = new Image { HeightRequest = 180, Aspect = Aspect.AspectFit };
                image.SetBinding(Image.SourceProperty, nameof(GroupMessageDto.ImageUrl));
                image.BindingContextChanged += (_, _) =>
                {
                    if (image.BindingContext is GroupMessageDto message)
                    {
                        image.IsVisible = message.Type == "image";
                        text.IsVisible = message.Type != "image";
                    }
                };

                var time = new Label { FontSize = 11, TextColor = Colors.Gray };
                time.SetBinding(Label.TextProperty, new Binding(nameof(GroupMessageDto.CreatedAt), stringFormat: "{0:HH:mm}"));

                return MobileTheme.CreateCard(
                    new VerticalStackLayout { Spacing = 4, Children = { sender, image, text, time } },
                    new Thickness(12),
                    18).WithMargin(new Thickness(0, 0, 0, 10));
            })
        };

        var sendButton = new Button { Text = "Enviar" };
        MobileTheme.StylePrimaryButton(sendButton);
        sendButton.Clicked += async (_, _) => await SendTextAsync();

        var imageButton = new Button { Text = "Foto" };
        MobileTheme.StyleSecondaryButton(imageButton);
        imageButton.Clicked += async (_, _) => await SendImageAsync();

        var composer = new Grid
        {
            ColumnDefinitions =
            {
                new ColumnDefinition(GridLength.Star),
                new ColumnDefinition(GridLength.Auto),
                new ColumnDefinition(GridLength.Auto)
            },
            ColumnSpacing = 8
        };
        composer.Add(_messageEntry);
        composer.Add(imageButton);
        composer.Add(sendButton);
        imageButton.SetValue(Grid.ColumnProperty, 1);
        sendButton.SetValue(Grid.ColumnProperty, 2);

        var layout = new Grid
        {
            Padding = new Thickness(14, 10),
            RowDefinitions =
            {
                new RowDefinition(GridLength.Star),
                new RowDefinition(GridLength.Auto)
            }
        };
        var composerCard = MobileTheme.CreateCard(composer, new Thickness(12), 22);
        layout.Add(_collectionView);
        layout.Add(composerCard);
        composerCard.SetValue(Grid.RowProperty, 1);

        Content = layout;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await LoadMessagesAsync();
        _timer ??= Dispatcher.CreateTimer();
        _timer.Interval = TimeSpan.FromSeconds(4);
        _timer.Tick += async (_, _) => await LoadMessagesAsync();
        _timer.Start();
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        _timer?.Stop();
    }

    private async Task LoadMessagesAsync()
    {
        var response = await _apiClient.GetGroupMessagesAsync(_group.Id);
        _messages.Clear();
        foreach (var item in response.Items)
        {
            _messages.Add(item);
        }
    }

    private async Task SendTextAsync()
    {
        if (string.IsNullOrWhiteSpace(_messageEntry.Text))
        {
            return;
        }

        await _apiClient.SendGroupTextAsync(_group.Id, _messageEntry.Text.Trim());
        _messageEntry.Text = string.Empty;
        await LoadMessagesAsync();
    }

    private async Task SendImageAsync()
    {
        var result = await FilePicker.Default.PickAsync(new PickOptions
        {
            PickerTitle = "Selecciona una imagen",
            FileTypes = FilePickerFileType.Images
        });

        if (result is null)
        {
            return;
        }

        var upload = await _apiClient.UploadMessageImageAsync(result.FullPath);
        await _apiClient.SendGroupImageAsync(_group.Id, upload.Url);
        await LoadMessagesAsync();
    }
}
