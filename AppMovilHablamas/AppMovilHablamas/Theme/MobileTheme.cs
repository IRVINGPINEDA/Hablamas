namespace AppMovilHablamas.Theme;

public static class MobileTheme
{
    public static readonly Color Accent = Color.FromArgb("#1677B3");

    public static void ApplyPage(Page page)
    {
        page.SetAppThemeColor(VisualElement.BackgroundColorProperty, Color.FromArgb("#F4F7FB"), Color.FromArgb("#09111F"));
    }

    public static Border CreateCard(View content, Thickness? padding = null, double radius = 24)
    {
        var border = new Border
        {
            Content = content,
            Padding = padding ?? new Thickness(18),
            StrokeThickness = 0,
            StrokeShape = new Microsoft.Maui.Controls.Shapes.RoundRectangle { CornerRadius = new CornerRadius(radius) },
            Shadow = new Shadow
            {
                Brush = Colors.Black,
                Opacity = 0.12f,
                Radius = 14,
                Offset = new Point(0, 6)
            }
        };

        border.SetAppThemeColor(VisualElement.BackgroundColorProperty, Colors.White, Color.FromArgb("#102033"));
        return border;
    }

    public static Border CreateSoftCard(View content, Thickness? padding = null, double radius = 22)
    {
        var border = CreateCard(content, padding, radius);
        border.SetAppThemeColor(VisualElement.BackgroundColorProperty, Color.FromArgb("#E7EFFA"), Color.FromArgb("#17314D"));
        return border;
    }

    public static void StylePrimaryButton(Button button)
    {
        button.BackgroundColor = Accent;
        button.TextColor = Colors.White;
        button.CornerRadius = 16;
        button.Padding = new Thickness(18, 14);
    }

    public static void StyleSecondaryButton(Button button)
    {
        button.CornerRadius = 16;
        button.Padding = new Thickness(18, 14);
        button.SetAppThemeColor(Button.BackgroundColorProperty, Color.FromArgb("#E7EFFA"), Color.FromArgb("#17314D"));
        button.SetAppThemeColor(Button.TextColorProperty, Color.FromArgb("#122033"), Color.FromArgb("#F3F7FC"));
    }

    public static void StyleInput(InputView input)
    {
        input.SetAppThemeColor(VisualElement.BackgroundColorProperty, Colors.White, Color.FromArgb("#102033"));
        input.SetAppThemeColor(InputView.TextColorProperty, Color.FromArgb("#122033"), Color.FromArgb("#F3F7FC"));
    }

    public static void StyleMutedText(Label label)
    {
        label.SetAppThemeColor(Label.TextColorProperty, Color.FromArgb("#60758A"), Color.FromArgb("#AFC0D3"));
    }

    public static BoxView CreateDivider()
    {
        var divider = new BoxView { HeightRequest = 1 };
        divider.SetAppThemeColor(BoxView.ColorProperty, Color.FromArgb("#D8E2EE"), Color.FromArgb("#1E3651"));
        return divider;
    }
}
