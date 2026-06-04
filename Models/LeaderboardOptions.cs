namespace SunnydaleLibrary.Models;

/// <summary>Bound from the "Leaderboard" config section. Env vars (LEADERBOARD_*) override.</summary>
public class LeaderboardOptions
{
    /// <summary>SQLite database file path. Defaults resolve per-environment (Docker vs local) at startup.</summary>
    public string DatabasePath { get; set; } = string.Empty;

    /// <summary>How many rows the public board / circulation card shows.</summary>
    public int TopCount { get; set; } = 10;

    /// <summary>Sanity ceiling — submissions above this are rejected as implausible.</summary>
    public int MaxScore { get; set; } = 1_000_000;

    /// <summary>Minimum seconds between accepted submissions from the same client key (abuse dampening).</summary>
    public int SubmitCooldownSeconds { get; set; } = 3;

    /// <summary>
    /// Require a valid signed run token (from /api/run/start) on score submit. Blocks scores that
    /// weren't produced by an actual play session. Set false to accept tokenless submits.
    /// </summary>
    public bool RequireRunToken { get; set; } = true;

    /// <summary>HMAC key for run tokens. Blank → a random key is generated per process at startup.</summary>
    public string SigningKey { get; set; } = string.Empty;

    /// <summary>Plausibility ceiling: a run can't have earned more than this many points per played second.</summary>
    public int PointsPerSecondCap { get; set; } = 3000;

    /// <summary>A run token older than this (seconds) is stale and rejected.</summary>
    public int TokenMaxAgeSeconds { get; set; } = 7200;

    /// <summary>A submit faster than this many seconds after the token was issued is rejected.</summary>
    public int MinPlaySeconds { get; set; } = 2;
}
