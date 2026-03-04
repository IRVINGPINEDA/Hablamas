namespace HablaMas.Application;

public static class ConversationPairHelper
{
    public static (Guid a, Guid b) Sort(Guid first, Guid second)
    {
        return first.CompareTo(second) <= 0 ? (first, second) : (second, first);
    }
}
