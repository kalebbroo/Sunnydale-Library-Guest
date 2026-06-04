namespace SunnydaleLibrary.Models;

/// <summary>A single high-score row on the "Stake Night" leaderboard.</summary>
public class ScoreEntry
{
    /// <summary>Arcade-style player tag, sanitized to 1-3 uppercase letters.</summary>
    public string Initials { get; set; } = string.Empty;

    /// <summary>Final score the player submitted.</summary>
    public int Score { get; set; }

    /// <summary>When the score was recorded (UTC).</summary>
    public DateTimeOffset CreatedUtc { get; set; }

    /// <summary>1-based position on the board. Set when read back for display; 0 if unknown.</summary>
    public int Rank { get; set; }
}
