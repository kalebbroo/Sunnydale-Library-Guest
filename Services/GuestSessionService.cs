using Microsoft.Extensions.Options;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Utils;

namespace SunnydaleLibrary.Services;

public class GuestSessionService(IUnifiClient unifi, IOptions<UnifiOptions> options) : IGuestSessionService
{
    public IUnifiClient Unifi { get; } = unifi;

    public UnifiOptions Options { get; } = options.Value;

    public const string DefaultRedirect = "https://hartsy.ai";

    public async Task<GuestSessionResult> SignInAsync(GuestSignIn form, CancellationToken ct)
    {
        UnifiRedirectParams redirect = form.ToRedirectParams();
        if (!redirect.HasValidClientMac())
        {
            Logs.Warning($"Guest sign-in missing/invalid client MAC. name={form.Name} reason={form.Reason}");
            return GuestSessionResult.Fail("The card catalog seems to be jammed. Reconnect to the WiFi and try again.");
        }
        Logs.Info($"Guest sign-in attempt: name={form.Name} reason={form.Reason} mac={redirect.Id} ap={redirect.Ap ?? "?"} ssid={redirect.Ssid ?? "?"}");
        bool ok = await Unifi.AuthorizeGuestAsync(redirect.Id!, redirect.Ap, Options.DefaultMinutes, ct);
        if (!ok)
        {
            return GuestSessionResult.Fail("The library's wards refused entry. Try again, or ask the librarian.");
        }
        string target = !string.IsNullOrWhiteSpace(redirect.Url) ? redirect.Url! : DefaultRedirect;
        return GuestSessionResult.Ok(target);
    }
}
