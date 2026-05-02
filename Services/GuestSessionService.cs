using Microsoft.Extensions.Options;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Utils;

namespace SunnydaleLibrary.Services;

public class GuestSessionService(IUnifiClient unifi, IEasterEggService eggs, IOptions<UnifiOptions> options) : IGuestSessionService
{
    public IUnifiClient Unifi { get; } = unifi;

    public IEasterEggService Eggs { get; } = eggs;

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
        // TODO(observability): record sign-in for egg discovery (e.g. "Slaying-Related" reason unlocks tier-2)
        await Eggs.RecordSignInAsync(form, ct);
        bool ok = await Unifi.AuthorizeGuestAsync(redirect.Id!, redirect.Ap, Options.DefaultMinutes, ct);
        if (!ok)
        {
            return GuestSessionResult.Fail("The library's wards refused entry. Try again, or ask the librarian.");
        }
        string target = !string.IsNullOrWhiteSpace(redirect.Url) ? redirect.Url! : DefaultRedirect;
        return GuestSessionResult.Ok(target);
    }
}
