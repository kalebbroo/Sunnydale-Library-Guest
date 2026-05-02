using SunnydaleLibrary.Models;

namespace SunnydaleLibrary.Services;

/// <summary>
/// Seam for the rabbit-hole layer. Day-1 scaffold ships only the interface and a no-op impl;
/// the full set of methods below is intentionally TODO so future-you can flesh out tier-by-tier
/// without touching the splash flow.
/// </summary>
public interface IEasterEggService
{
    /// <summary>Called every time a guest signs in. Use to track reason-based egg unlocks.</summary>
    Task RecordSignInAsync(GuestSignIn form, CancellationToken ct);

    // TODO(easter-egg-tier2): Task<CatalogEntry?> LookupBookAsync(string deweyOrTitle, CancellationToken ct);
    // TODO(easter-egg-tier3): Task<WatchersJournalEntry> GetTodaysJournalAsync(CancellationToken ct);
    // TODO(easter-egg-tier3): Task<bool> CheckRestrictedSectionPasswordAsync(string attempt, CancellationToken ct);
    // TODO(observability): Task<int> GetDiscoveryCountAsync(string eggKey, CancellationToken ct);
}
