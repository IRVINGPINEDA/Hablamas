using AppMovilHablamas.Pages;
using AppMovilHablamas.Theme;

namespace AppMovilHablamas;

public partial class AppShell : TabbedPage
{
    public AppShell(ChatsPage chatsPage, GroupsPage groupsPage, ContactsPage contactsPage, MobileChatbotPage chatbotPage, ProfilePage profilePage)
    {
        InitializeComponent();
        Title = "Habla Mas";
        MobileTheme.ApplyPage(this);
        BarBackgroundColor = Application.Current?.RequestedTheme == AppTheme.Dark ? Color.FromArgb("#102033") : Colors.White;
        SelectedTabColor = MobileTheme.Accent;
        UnselectedTabColor = Application.Current?.RequestedTheme == AppTheme.Dark ? Color.FromArgb("#AFC0D3") : Color.FromArgb("#60758A");

        Children.Add(new NavigationPage(chatsPage) { Title = "Chats" });
        Children.Add(new NavigationPage(groupsPage) { Title = "Grupos" });
        Children.Add(new NavigationPage(contactsPage) { Title = "Contactos" });
        Children.Add(new NavigationPage(chatbotPage) { Title = "Chatbot" });
        Children.Add(new NavigationPage(profilePage) { Title = "Perfil" });
    }
}
