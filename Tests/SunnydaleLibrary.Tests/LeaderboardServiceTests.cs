using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Services;
using Xunit;

namespace SunnydaleLibrary.Tests;

/// <summary>
/// Integration tests against a real (temp-file) SQLite DB — the service opens a fresh
/// connection per call, so an in-memory DB wouldn't share state. Each test gets its own file.
/// </summary>
public sealed class LeaderboardServiceTests : IDisposable
{
    private readonly string _dir;

    public LeaderboardServiceTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "sntests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private async Task<(LeaderboardService svc, LeaderboardOptions opts)> MakeAsync(int cooldown = 0, int maxScore = 1_000_000)
    {
        LeaderboardOptions opts = new()
        {
            DatabasePath = Path.Combine(_dir, Guid.NewGuid().ToString("N") + ".db"),
            SubmitCooldownSeconds = cooldown,
            MaxScore = maxScore,
            TopCount = 10,
        };
        LeaderboardService svc = new(Options.Create(opts));
        await svc.EnsureSchemaAsync(CancellationToken.None);
        return (svc, opts);
    }

    [Fact]
    public void SanitizeInitials_UppercasesStripsAndCapsAtThree()
    {
        Assert.Equal("BTV", LeaderboardService.SanitizeInitials("btv"));
        Assert.Equal("XAN", LeaderboardService.SanitizeInitials("xan!!9"));
        Assert.Equal("AB", LeaderboardService.SanitizeInitials("a b"));
        Assert.Equal("", LeaderboardService.SanitizeInitials("123"));
        Assert.Equal("WIL", LeaderboardService.SanitizeInitials("willow"));   // capped at 3
    }

    [Fact]
    public async Task SubmitScore_SanitizesInitials()
    {
        (LeaderboardService svc, _) = await MakeAsync();
        ScoreSubmissionResult? result = await svc.SubmitScoreAsync("btv!", 500, "client-1", CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal("BTV", result!.Entry.Initials);
        Assert.Equal(1, result.Rank);
    }

    [Theory]
    [InlineData(-5)]
    [InlineData(2_000_000)]   // above MaxScore
    public async Task SubmitScore_RejectsOutOfRangeScores(int score)
    {
        (LeaderboardService svc, _) = await MakeAsync();
        ScoreSubmissionResult? result = await svc.SubmitScoreAsync("BUF", score, "client-1", CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task SubmitScore_RejectsInitialsWithNoLetters()
    {
        (LeaderboardService svc, _) = await MakeAsync();
        ScoreSubmissionResult? result = await svc.SubmitScoreAsync("123", 100, "client-1", CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task GetTop_RanksHighestFirst_WithSequentialRanks()
    {
        (LeaderboardService svc, _) = await MakeAsync();
        await svc.SubmitScoreAsync("AAA", 100, "k", CancellationToken.None);
        await svc.SubmitScoreAsync("BBB", 900, "k", CancellationToken.None);
        await svc.SubmitScoreAsync("CCC", 500, "k", CancellationToken.None);

        IReadOnlyList<ScoreEntry> top = await svc.GetTopAsync(10, LeaderboardPeriod.AllTime, CancellationToken.None);

        Assert.Equal(3, top.Count);
        Assert.Equal(new[] { "BBB", "CCC", "AAA" }, top.Select(e => e.Initials).ToArray());
        Assert.Equal(new[] { 1, 2, 3 }, top.Select(e => e.Rank).ToArray());
        Assert.Equal(2, top[1].Rank);
    }

    [Fact]
    public async Task SubmitScore_RankReflectsHigherScores()
    {
        (LeaderboardService svc, _) = await MakeAsync();
        await svc.SubmitScoreAsync("AAA", 1000, "k", CancellationToken.None);
        ScoreSubmissionResult? second = await svc.SubmitScoreAsync("BBB", 400, "k", CancellationToken.None);

        Assert.NotNull(second);
        Assert.Equal(2, second!.Rank);   // one higher score exists
    }

    [Fact]
    public async Task SubmitScore_EnforcesPerClientCooldown()
    {
        (LeaderboardService svc, _) = await MakeAsync(cooldown: 30);
        ScoreSubmissionResult? first = await svc.SubmitScoreAsync("AAA", 100, "same-ip", CancellationToken.None);
        ScoreSubmissionResult? second = await svc.SubmitScoreAsync("BBB", 200, "same-ip", CancellationToken.None);
        ScoreSubmissionResult? otherClient = await svc.SubmitScoreAsync("CCC", 300, "other-ip", CancellationToken.None);

        Assert.NotNull(first);
        Assert.Null(second);          // blocked by cooldown
        Assert.NotNull(otherClient);  // different client key is unaffected
    }

    [Fact]
    public async Task GetTop_TodayExcludesOlderDays()
    {
        (LeaderboardService svc, LeaderboardOptions opts) = await MakeAsync();
        // A current score via the service...
        await svc.SubmitScoreAsync("NOW", 100, "k", CancellationToken.None);
        // ...and a high score back-dated to a previous day, inserted directly.
        await using (SqliteConnection conn = new($"Data Source={opts.DatabasePath}"))
        {
            await conn.OpenAsync();
            SqliteCommand cmd = conn.CreateCommand();
            cmd.CommandText = "INSERT INTO scores (initials, score, created_utc) VALUES ('OLD', 9999, '2020-01-01T00:00:00.0000000+00:00');";
            await cmd.ExecuteNonQueryAsync();
        }

        IReadOnlyList<ScoreEntry> allTime = await svc.GetTopAsync(10, LeaderboardPeriod.AllTime, CancellationToken.None);
        IReadOnlyList<ScoreEntry> today = await svc.GetTopAsync(10, LeaderboardPeriod.Today, CancellationToken.None);

        Assert.Contains(allTime, e => e.Initials == "OLD");   // present all-time
        Assert.Equal("OLD", allTime[0].Initials);             // and tops it (9999)
        Assert.DoesNotContain(today, e => e.Initials == "OLD"); // excluded from today
        Assert.Contains(today, e => e.Initials == "NOW");
    }

    [Fact]
    public async Task GetCount_CountsAllRows()
    {
        (LeaderboardService svc, _) = await MakeAsync();
        await svc.SubmitScoreAsync("AAA", 100, "k", CancellationToken.None);
        await svc.SubmitScoreAsync("BBB", 200, "k", CancellationToken.None);

        Assert.Equal(2, await svc.GetCountAsync(CancellationToken.None));
    }
}
