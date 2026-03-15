using System.Collections.ObjectModel;
using AppMovilHablamas.Models;
using AppMovilHablamas.Services;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas.Pages;

public sealed class MobileChatbotPage : ContentPage
{
    private readonly HablaMasApiClient _apiClient;
    private readonly ObservableCollection<ChatMessageItem> _messages = [];
    private readonly ObservableCollection<ChatbotImageDto> _pendingImages = [];
    private readonly CollectionView _messagesView;
    private readonly CollectionView _pendingView;
    private readonly Editor _input = new() { Placeholder = "Escribe tu pregunta", AutoSize = EditorAutoSizeOption.TextChanges, MinimumHeightRequest = 120 };

    public MobileChatbotPage(HablaMasApiClient apiClient)
    {
        _apiClient = apiClient;
        Title = "Chatbot";
        MobileTheme.ApplyPage(this);
        MobileTheme.StyleInput(_input);

        _messagesView = new CollectionView
        {
            ItemsSource = _messages,
            ItemTemplate = new DataTemplate(() =>
            {
                var role = new Label { FontSize = 12, TextColor = Color.FromArgb("#5f7888"), FontAttributes = FontAttributes.Bold };
                role.SetBinding(Label.TextProperty, nameof(ChatMessageItem.RoleLabel));
                var content = new Label { LineBreakMode = LineBreakMode.WordWrap };
                content.SetBinding(Label.TextProperty, nameof(ChatMessageItem.Content));
                return MobileTheme.CreateCard(
                    new VerticalStackLayout { Spacing = 6, Children = { role, content } },
                    new Thickness(12),
                    18).WithMargin(new Thickness(0, 0, 0, 10));
            })
        };

        _pendingView = new CollectionView
        {
            HeightRequest = 90,
            ItemsSource = _pendingImages,
            ItemTemplate = new DataTemplate(() =>
            {
                var label = new Label { FontSize = 12 };
                label.SetBinding(Label.TextProperty, nameof(ChatbotImageDto.Name));
                return MobileTheme.CreateSoftCard(label, new Thickness(8), 16).WithMargin(new Thickness(0, 0, 8, 0));
            })
        };

        var attachButton = new Button { Text = "Adjuntar imagen" };
        MobileTheme.StyleSecondaryButton(attachButton);
        attachButton.Clicked += async (_, _) => await PickImagesAsync();

        var sendButton = new Button { Text = "Enviar" };
        MobileTheme.StylePrimaryButton(sendButton);
        sendButton.Clicked += async (_, _) => await SendAsync();

        var helperLabel = new Label
        {
            Text = "Enviale texto e imagenes para obtener apoyo rapido desde Groq.",
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
                                new Label { Text = "Asistente multimodal", FontSize = 22, FontAttributes = FontAttributes.Bold },
                                helperLabel
                            }
                        },
                        new Thickness(18),
                        24),
                    MobileTheme.CreateCard(_messagesView, new Thickness(10), 24),
                    MobileTheme.CreateCard(
                        new VerticalStackLayout
                        {
                            Spacing = 10,
                            Children =
                            {
                                _pendingView,
                                _input,
                                new HorizontalStackLayout { Spacing = 8, Children = { attachButton, sendButton } }
                            }
                        },
                        new Thickness(14),
                        24)
                }
            }
        };
    }

    private async Task PickImagesAsync()
    {
        var files = await FilePicker.Default.PickMultipleAsync(new PickOptions
        {
            PickerTitle = "Selecciona imagenes",
            FileTypes = FilePickerFileType.Images
        });

        if (files is null)
        {
            return;
        }

        foreach (var file in files.Where(file => file is not null).Select(file => file!).Take(4))
        {
            var stream = await file.OpenReadAsync();
            if (stream is null)
            {
                continue;
            }

            await using var imageStream = stream;
            using var memory = new MemoryStream();
            await imageStream.CopyToAsync(memory);
            _pendingImages.Add(new ChatbotImageDto
            {
                Name = file.FileName,
                ContentType = GetContentType(file.FileName),
                Base64Data = Convert.ToBase64String(memory.ToArray()),
                LocalPath = file.FullPath ?? string.Empty
            });
        }
    }

    private async Task SendAsync()
    {
        if (string.IsNullOrWhiteSpace(_input.Text) && _pendingImages.Count == 0)
        {
            return;
        }

        var text = _input.Text?.Trim() ?? string.Empty;
        var history = _messages.TakeLast(12).Select(item => new ChatbotHistoryItemDto
        {
            Role = item.RoleLabel == "Yo" ? "user" : "assistant",
            Content = item.Content
        }).ToArray();

        _messages.Add(new ChatMessageItem("Yo", string.IsNullOrWhiteSpace(text) ? "Imagen adjunta" : text));

        var images = _pendingImages.ToArray();
        _input.Text = string.Empty;
        _pendingImages.Clear();

        try
        {
            var reply = await _apiClient.SendChatbotMessageAsync(text, history, images);
            _messages.Add(new ChatMessageItem("Habla Mas IA", reply.Reply));
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync("Chatbot", ex.Message, "OK");
        }
    }

    private static string GetContentType(string fileName)
    {
        return System.IO.Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => "image/jpeg"
        };
    }

    private sealed class ChatMessageItem
    {
        public ChatMessageItem(string roleLabel, string content)
        {
            RoleLabel = roleLabel;
            Content = content;
        }

        public string RoleLabel { get; }
        public string Content { get; }
    }
}
