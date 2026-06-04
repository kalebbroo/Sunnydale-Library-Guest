using Microsoft.AspNetCore.Mvc.RazorPages;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Services;

namespace SunnydaleLibrary.Pages;

public class IndexModel(ILeaderboardService leaderboard) : PageModel
{
    public ILeaderboardService Leaderboard { get; } = leaderboard;

    public UnifiRedirectParams RedirectParams { get; private set; } = new();

    public string? ErrorMessage { get; set; }

    /// <summary>Top scores, disguised on the splash as a "Frequently Checked Out" circulation card.</summary>
    public IReadOnlyList<ScoreEntry> TopScores { get; private set; } = [];

    /// <summary>Today's #1, surfaced as "tonight's top slayer" — null if no scores yet today.</summary>
    public ScoreEntry? TonightsTop { get; private set; }

    public async Task OnGetAsync(CancellationToken ct)
    {
        RedirectParams = UnifiRedirectParams.FromQuery(Request.Query);
        if (TempData.TryGetValue("Error", out object? error) && error is string errorText)
        {
            ErrorMessage = errorText;
        }
        // Show a short all-time board; the full game/board lives behind the stake link to /Game.
        TopScores = await Leaderboard.GetTopAsync(5, LeaderboardPeriod.AllTime, ct);
        IReadOnlyList<ScoreEntry> today = await Leaderboard.GetTopAsync(1, LeaderboardPeriod.Today, ct);
        TonightsTop = today.Count > 0 ? today[0] : null;
    }
}
