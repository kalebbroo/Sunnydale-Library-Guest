using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Pages;
using SunnydaleLibrary.Services;
using Xunit;

namespace SunnydaleLibrary.Tests;

/// <summary>
/// The captive sign-in page must keep working even if the leaderboard DB is down — getting guests
/// online is the portal's whole job, and the board is only a nicety on top of it.
/// </summary>
public class SplashResilienceTests
{
    [Fact]
    public async Task Splash_StillRenders_WhenLeaderboardThrows()
    {
        IndexModel page = new(new ThrowingLeaderboard());
        DefaultHttpContext http = new();
        page.PageContext = new PageContext { HttpContext = http };
        page.TempData = new TempDataDictionary(http, new NullTempDataProvider());

        // Must not throw, even though every leaderboard call blows up.
        await page.OnGetAsync(CancellationToken.None);

        Assert.Empty(page.TopScores);
        Assert.Null(page.TonightsTop);
    }

    private sealed class ThrowingLeaderboard : ILeaderboardService
    {
        public Task EnsureSchemaAsync(CancellationToken ct) => Task.CompletedTask;
        public Task<ScoreSubmissionResult?> SubmitScoreAsync(string initials, int score, string? clientKey, CancellationToken ct)
            => throw new InvalidOperationException("db down");
        public Task<IReadOnlyList<ScoreEntry>> GetTopAsync(int count, LeaderboardPeriod period, CancellationToken ct)
            => throw new InvalidOperationException("db down");
        public Task<int> GetCountAsync(CancellationToken ct) => throw new InvalidOperationException("db down");
    }

    private sealed class NullTempDataProvider : ITempDataProvider
    {
        public IDictionary<string, object?> LoadTempData(HttpContext context) => new Dictionary<string, object?>();
        public void SaveTempData(HttpContext context, IDictionary<string, object?> values) { }
    }
}
