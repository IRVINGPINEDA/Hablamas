using System.Collections.ObjectModel;
using AppMovilHablamas.Models;
using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class DirectChatPage : ContentPage
{
    private readonly HablaMasApiClient _apiClient;
    private readonly ChatRealtimeService _realtimeService;
    private readonly AppSession _session;
    private readonly ConversationSummaryDto _conversation;
    private readonly ObservableCollection<MessageViewItem> _messages = [];
    private readonly CollectionView _messagesView;
    private readonly Entry _messageEntry = new() { Placeholder = "Escribe un mensaje" };
    private readonly Label _typingLabel = new() { FontSize = 12 };

    public DirectChatPage(HablaMasApiClient apiClient, ChatRealtimeService realtimeService, AppSession session, ConversationSummaryDto conversation)
    {
        _apiClient = apiClient;
        _realtimeService = realtimeService;
        _session = session;
        _conversation = conversation;
        Title = conversation.Contact.Alias ?? conversation.Contact.PublicAlias;
        MobileTheme.ApplyPage(this);
        MobileTheme.StyleInput(_messageEntry);
        MobileTheme.StyleMutedText(_typingLabel);

        _messagesView = new CollectionView
        {
            ItemsSource = _messages,
            ItemTemplate = new DataTemplate(() =>
            {
                var textLabel = new Label { LineBreakMode = LineBreakMode.WordWrap };
                textLabel.SetBinding(Label.TextProperty, nameof(MessageViewItem.DisplayText));

                var timeLabel = new Label { FontSize = 11, TextColor = Colors.Gray };
                timeLabel.SetBinding(Label.TextProperty, nameof(MessageViewItem.MetaText));

                var image = new Image { HeightRequest = 180, Aspect = Aspect.AspectFit };
                image.SetBinding(Image.SourceProperty, nameof(MessageViewItem.ImageUrl));
                image.SetBinding(IsVisibleProperty, nameof(MessageViewItem.HasImage));

                var bubble = MobileTheme.CreateCard(
                    new VerticalStackLayout
                    {
                        Spacing = 6,
                        Children = { image, textLabel, timeLabel }
                    },
                    new Thickness(12),
                    18);

                bubble.BindingContextChanged += (_, _) =>
                {
                    if (bubble.BindingContext is MessageViewItem item)
                    {
                        bubble.BackgroundColor = item.BubbleColor;
                        bubble.HorizontalOptions = item.BubbleAlignment;
                        bubble.Margin = new Thickness(0, 0, 0, 10);
                    }
                };

                return bubble;
            })
        };

        var sendButton = new Button { Text = "Enviar" };
        MobileTheme.StylePrimaryButton(sendButton);
        sendButton.Clicked += async (_, _) => await SendTextAsync();

        var imageButton = new Button { Text = "Foto" };
        MobileTheme.StyleSecondaryButton(imageButton);
        imageButton.Clicked += async (_, _) => await SendImageAsync();

        _messageEntry.TextChanged += async (_, args) =>
        {
            await _realtimeService.SendTypingAsync(_conversation.Id, !string.IsNullOrWhiteSpace(args.NewTextValue));
        };

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
                new RowDefinition(GridLength.Auto),
                new RowDefinition(GridLength.Star),
                new RowDefinition(GridLength.Auto)
            }
        };
        var composerCard = MobileTheme.CreateCard(composer, new Thickness(12), 22);
        layout.Add(_typingLabel);
        layout.Add(_messagesView);
        layout.Add(composerCard);
        _messagesView.SetValue(Grid.RowProperty, 1);
        composerCard.SetValue(Grid.RowProperty, 2);
        Content = layout;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        _realtimeService.MessageReceived += OnMessageReceived;
        _realtimeService.StatusUpdated += OnStatusUpdated;
        _realtimeService.TypingUpdated += OnTypingUpdated;
        await _realtimeService.JoinConversationAsync(_conversation.Id);
        await LoadMessagesAsync();
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        _realtimeService.MessageReceived -= OnMessageReceived;
        _realtimeService.StatusUpdated -= OnStatusUpdated;
        _realtimeService.TypingUpdated -= OnTypingUpdated;
    }

    private async Task LoadMessagesAsync()
    {
        var response = await _apiClient.GetMessagesAsync(_conversation.Id);
        _messages.Clear();
        foreach (var message in response.Items)
        {
            _messages.Add(MessageViewItem.FromMessage(message, _session.CurrentUser?.Id));
        }

        var last = response.Items.LastOrDefault();
        if (last is not null)
        {
            await _apiClient.MarkSeenAsync(_conversation.Id, last.Id);
            await _realtimeService.MarkSeenAsync(_conversation.Id, last.Id);
        }
    }

    private async Task SendTextAsync()
    {
        if (string.IsNullOrWhiteSpace(_messageEntry.Text))
        {
            return;
        }

        var text = _messageEntry.Text.Trim();
        _messageEntry.Text = string.Empty;
        await _realtimeService.SendTextAsync(_conversation.Id, text);
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
        await _realtimeService.SendImageAsync(_conversation.Id, upload.Url);
    }

    private void OnMessageReceived(object? sender, HubMessageEnvelopeDto e)
    {
        if (e.ConversationId != _conversation.Id)
        {
            return;
        }

        MainThread.BeginInvokeOnMainThread(async () =>
        {
            if (_messages.All(item => item.Id != e.Message.Id))
            {
                _messages.Add(MessageViewItem.FromHubMessage(e.Message, _session.CurrentUser?.Id));
                await _realtimeService.MarkSeenAsync(_conversation.Id, e.Message.Id);
            }
        });
    }

    private void OnStatusUpdated(object? sender, HubStatusDto e)
    {
        if (e.ConversationId != _conversation.Id)
        {
            return;
        }

        MainThread.BeginInvokeOnMainThread(() =>
        {
            foreach (var item in _messages.Where(item => item.Id == e.MessageId || (e.MessageId is null && item.IsOwn)))
            {
                item.Status = e.Status;
                item.RefreshMeta();
            }
        });
    }

    private void OnTypingUpdated(object? sender, HubTypingDto e)
    {
        if (e.ConversationId != _conversation.Id || e.UserId.ToString() == _session.CurrentUser?.Id)
        {
            return;
        }

        MainThread.BeginInvokeOnMainThread(() =>
        {
            _typingLabel.Text = e.IsTyping ? "La otra persona esta escribiendo..." : string.Empty;
        });
    }

    private sealed class MessageViewItem : BindableObject
    {
        public Guid Id { get; init; }
        public bool IsOwn { get; init; }
        public string? Text { get; init; }
        public string? ImageUrl { get; init; }
        public DateTimeOffset CreatedAt { get; init; }
        public string Status { get; set; } = "Sent";
        public string DisplayText => string.IsNullOrWhiteSpace(Text) ? string.Empty : Text;
        public string MetaText { get; private set; } = string.Empty;
        public bool HasImage => !string.IsNullOrWhiteSpace(ImageUrl);
        public Color BubbleColor => IsOwn ? Color.FromArgb("#D6ECFA") : Color.FromArgb("#EDF2F7");
        public LayoutOptions BubbleAlignment => IsOwn ? LayoutOptions.End : LayoutOptions.Start;

        public static MessageViewItem FromMessage(MessageDto message, string? currentUserId)
        {
            var item = new MessageViewItem
            {
                Id = message.Id,
                IsOwn = message.SenderId.ToString() == currentUserId,
                Text = message.Text,
                ImageUrl = message.ImageUrl,
                CreatedAt = message.CreatedAt,
                Status = message.Status
            };
            item.RefreshMeta();
            return item;
        }

        public static MessageViewItem FromHubMessage(HubMessageDto message, string? currentUserId)
        {
            var item = new MessageViewItem
            {
                Id = message.Id,
                IsOwn = message.SenderId.ToString() == currentUserId,
                Text = message.Text,
                ImageUrl = message.ImageUrl,
                CreatedAt = message.CreatedAt,
                Status = "Sent"
            };
            item.RefreshMeta();
            return item;
        }

        public void RefreshMeta()
        {
            MetaText = IsOwn ? $"{CreatedAt:HH:mm} - {Status}" : $"{CreatedAt:HH:mm}";
            OnPropertyChanged(nameof(MetaText));
        }
    }
}
