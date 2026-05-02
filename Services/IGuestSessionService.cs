using SunnydaleLibrary.Models;

namespace SunnydaleLibrary.Services;

public interface IGuestSessionService
{
    Task<GuestSessionResult> SignInAsync(GuestSignIn form, CancellationToken ct);
}

public class GuestSessionResult
{
    public bool Success { get; set; }

    public string? RedirectUrl { get; set; }

    public string? ErrorMessage { get; set; }

    public static GuestSessionResult Ok(string redirectUrl)
    {
        return new GuestSessionResult { Success = true, RedirectUrl = redirectUrl };
    }

    public static GuestSessionResult Fail(string error)
    {
        return new GuestSessionResult { Success = false, ErrorMessage = error };
    }
}
