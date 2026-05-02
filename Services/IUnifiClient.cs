namespace SunnydaleLibrary.Services;

/// <summary>Talks to the UniFi controller's local API to authorize guest devices.</summary>
public interface IUnifiClient
{
    /// <summary>Authorizes a guest device for the given duration. Returns true on controller "ok".</summary>
    Task<bool> AuthorizeGuestAsync(string mac, string? apMac, int minutes, CancellationToken ct);
}
