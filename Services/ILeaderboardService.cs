using SunnydaleLibrary.Models;

namespace SunnydaleLibrary.Services;

/// <summary>Which slice of the board to read.</summary>
public enum LeaderboardPeriod
{
    /// <summary>Every score ever recorded.</summary>
    AllTime,

    /// <summary>Scores recorded since UTC midnight today ("tonight's slayers").</summary>
    Today,
}

/// <summary>
/// Persists and serves the shared "Stake Night" high-score leaderboard. Backed by SQLite so
/// scores survive container restarts. Replaces the old no-op easter-egg seam.
/// </summary>
public interface ILeaderboardService
{
    /// <summary>Creates the scores table/index if they don't exist. Call once at startup.</summary>
    Task EnsureSchemaAsync(CancellationToken ct);

    /// <summary>
    /// Records a score after sanitizing initials and clamping the value. Returns the result of
    /// the submission (sanitized entry + its 1-based rank), or null if the submission was rejected.
    /// </summary>
    Task<ScoreSubmissionResult?> SubmitScoreAsync(string initials, int score, string? clientKey, CancellationToken ct);

    /// <summary>Returns the top <paramref name="count"/> scores for the period, highest first, with ranks set.</summary>
    Task<IReadOnlyList<ScoreEntry>> GetTopAsync(int count, LeaderboardPeriod period, CancellationToken ct);

    /// <summary>Total number of scores recorded.</summary>
    Task<int> GetCountAsync(CancellationToken ct);
}

/// <summary>Outcome of a successful score submission.</summary>
public class ScoreSubmissionResult
{
    public ScoreEntry Entry { get; set; } = new();

    public int Rank { get; set; }
}
