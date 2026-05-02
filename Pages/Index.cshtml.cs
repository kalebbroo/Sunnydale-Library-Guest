using Microsoft.AspNetCore.Mvc.RazorPages;
using SunnydaleLibrary.Models;

namespace SunnydaleLibrary.Pages;

public class IndexModel : PageModel
{
    public UnifiRedirectParams RedirectParams { get; private set; } = new();

    public string? ErrorMessage { get; set; }

    public void OnGet()
    {
        RedirectParams = UnifiRedirectParams.FromQuery(Request.Query);
        if (TempData.TryGetValue("Error", out object? error) && error is string errorText)
        {
            ErrorMessage = errorText;
        }
    }
}
