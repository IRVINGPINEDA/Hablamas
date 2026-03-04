namespace HablaMas.Application.DTOs;

public sealed class PagedResult<T>
{
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int Total { get; set; }
    public IReadOnlyCollection<T> Items { get; set; } = [];
}
