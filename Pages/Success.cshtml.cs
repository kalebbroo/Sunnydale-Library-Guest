using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Services;
using SunnydaleLibrary.Utils;

namespace SunnydaleLibrary.Pages;

public class SuccessModel(IGuestSessionService sessions) : PageModel
{
    public IGuestSessionService Sessions { get; } = sessions;

    public string RedirectUrl { get; set; } = string.Empty;

    public IActionResult OnGet()
    {
        return RedirectToPage("/Index");
    }

    public async Task<IActionResult> OnPostAsync(GuestSignIn form, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            Logs.Warning($"Sign-in form invalid for name='{form.Name}' reason='{form.Reason}'");
            return RedirectWithError("Please complete every field, including the policy checkbox.");
        }
        GuestSessionResult result = await Sessions.SignInAsync(form, ct);
        if (!result.Success)
        {
            return RedirectWithError(result.ErrorMessage ?? "Something went sideways.");
        }
        RedirectUrl = result.RedirectUrl ?? GuestSessionService.DefaultRedirect;
        return Page();
    }

    public IActionResult RedirectWithError(string message)
    {
        TempData["Error"] = message;
        return RedirectToPage("/Index");
    }
}
