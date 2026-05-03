using Microsoft.Extensions.Options;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Utils;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SunnydaleLibrary.Services;

/// <summary>
/// Talks to a UniFi OS controller (UDM / UDM-Pro / UDM-SE / UDR).
/// UniFi OS API differs from the standalone Network controller:
///   - Login:        POST {ControllerUrl}/api/auth/login
///   - Network API:  prefixed with /proxy/network/...
///   - CSRF:         X-CSRF-Token header required after login; rotated on responses.
/// </summary>
public class UnifiClient(HttpClient http, IOptions<UnifiOptions> options) : IUnifiClient
{
    public UnifiOptions Options { get; } = options.Value;

    public HttpClient Http { get; } = http;

    public bool LoggedIn { get; private set; }

    public string? CsrfToken { get; private set; }

    public async Task<bool> AuthorizeGuestAsync(string mac, string? apMac, int minutes, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(Options.ControllerUrl) || string.IsNullOrWhiteSpace(Options.Username) || string.IsNullOrWhiteSpace(Options.Password))
        {
            Logs.Error("UniFi not configured: ControllerUrl/Username/Password missing.");
            return false;
        }
        if (!LoggedIn)
        {
            await LoginAsync(ct);
        }
        bool ok = await TryAuthorizeAsync(mac, apMac, minutes, ct);
        if (!ok && !LoggedIn)
        {
            // 401 path: re-login once and retry.
            await LoginAsync(ct);
            ok = await TryAuthorizeAsync(mac, apMac, minutes, ct);
        }
        return ok;
    }

    public async Task LoginAsync(CancellationToken ct)
    {
        string url = $"{Options.ControllerUrl.TrimEnd('/')}/api/auth/login";
        LoginRequest body = new() { Username = Options.Username, Password = Options.Password };
        try
        {
            HttpRequestMessage req = new(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
            HttpResponseMessage resp = await Http.SendAsync(req, ct);
            CaptureCsrfToken(resp);
            if (!resp.IsSuccessStatusCode)
            {
                string text = await resp.Content.ReadAsStringAsync(ct);
                Logs.Error($"UniFi login HTTP {(int)resp.StatusCode}: {Truncate(text, 200)}");
                LoggedIn = false;
                return;
            }
            // UniFi OS returns a user object on success (not the standalone {meta:{rc:"ok"}} envelope).
            // A 200 with a non-empty TOKEN cookie + CSRF header is sufficient proof.
            LoggedIn = true;
            Logs.Info($"UniFi login ok user={Options.Username} csrf={(string.IsNullOrEmpty(CsrfToken) ? "none" : "captured")}");
        }
        catch (Exception ex)
        {
            Logs.Error($"UniFi login exception: {ex.Message}");
            LoggedIn = false;
        }
    }

    public async Task<bool> TryAuthorizeAsync(string mac, string? apMac, int minutes, CancellationToken ct)
    {
        string url = $"{Options.ControllerUrl.TrimEnd('/')}/proxy/network/api/s/{Options.Site}/cmd/stamgr";
        AuthorizeRequest body = new() { Cmd = "authorize-guest", Mac = mac, Minutes = minutes, ApMac = apMac };
        try
        {
            HttpRequestMessage req = new(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
            if (!string.IsNullOrEmpty(CsrfToken))
            {
                req.Headers.Add("X-CSRF-Token", CsrfToken);
            }
            HttpResponseMessage resp = await Http.SendAsync(req, ct);
            CaptureCsrfToken(resp);
            if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                LoggedIn = false;
                return false;
            }
            if (!resp.IsSuccessStatusCode)
            {
                string text = await resp.Content.ReadAsStringAsync(ct);
                Logs.Error($"UniFi authorize HTTP {(int)resp.StatusCode}: {Truncate(text, 200)}");
                return false;
            }
            UnifiMeta? meta = await ParseMetaAsync(resp, ct);
            bool ok = meta?.Rc == "ok";
            if (ok)
            {
                Logs.Info($"UniFi authorize-guest ok mac={mac} ap={apMac ?? "?"} minutes={minutes}");
            }
            else
            {
                Logs.Error($"UniFi authorize-guest refused: {meta?.Msg ?? "unknown"} mac={mac}");
            }
            return ok;
        }
        catch (Exception ex)
        {
            Logs.Error($"UniFi authorize exception: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// UniFi OS sets / rotates the CSRF token on responses. Capture from either header name.
    /// </summary>
    public void CaptureCsrfToken(HttpResponseMessage resp)
    {
        if (resp.Headers.TryGetValues("X-CSRF-Token", out IEnumerable<string>? csrf))
        {
            string? value = csrf.FirstOrDefault();
            if (!string.IsNullOrEmpty(value))
            {
                CsrfToken = value;
                return;
            }
        }
        if (resp.Headers.TryGetValues("X-Updated-CSRF-Token", out IEnumerable<string>? updated))
        {
            string? value = updated.FirstOrDefault();
            if (!string.IsNullOrEmpty(value))
            {
                CsrfToken = value;
            }
        }
    }

    public static async Task<UnifiMeta?> ParseMetaAsync(HttpResponseMessage resp, CancellationToken ct)
    {
        try
        {
            UnifiResponse? parsed = await resp.Content.ReadFromJsonAsync<UnifiResponse>(cancellationToken: ct);
            return parsed?.Meta;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static string Truncate(string s, int max)
    {
        return s.Length <= max ? s : s[..max] + "...";
    }

    public class LoginRequest
    {
        [JsonPropertyName("username")] public string Username { get; set; } = string.Empty;
        [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;
    }

    public class AuthorizeRequest
    {
        [JsonPropertyName("cmd")] public string Cmd { get; set; } = string.Empty;
        [JsonPropertyName("mac")] public string Mac { get; set; } = string.Empty;
        [JsonPropertyName("minutes")] public int Minutes { get; set; }
        [JsonPropertyName("ap_mac")] public string? ApMac { get; set; }
    }

    public class UnifiResponse
    {
        [JsonPropertyName("meta")] public UnifiMeta? Meta { get; set; }
    }

    public class UnifiMeta
    {
        [JsonPropertyName("rc")] public string? Rc { get; set; }
        [JsonPropertyName("msg")] public string? Msg { get; set; }
    }
}
