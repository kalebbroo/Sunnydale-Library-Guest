using System.Text.Json.Serialization;

namespace SunnydaleLibrary.Models;

/// <summary>Request body for POST /api/scores (posted by the game on game-over).</summary>
public class ScoreSubmission
{
    [JsonPropertyName("initials")] public string? Initials { get; set; }

    [JsonPropertyName("score")] public int Score { get; set; }

    /// <summary>Signed run token from /api/run/start, proving this score came from a real play session.</summary>
    [JsonPropertyName("token")] public string? Token { get; set; }
}

/// <summary>Wire shape for a leaderboard row returned to the game client.</summary>
public class ScoreDto
{
    [JsonPropertyName("rank")] public int Rank { get; set; }

    [JsonPropertyName("initials")] public string Initials { get; set; } = string.Empty;

    [JsonPropertyName("score")] public int Score { get; set; }

    public static ScoreDto From(ScoreEntry entry)
    {
        return new ScoreDto { Rank = entry.Rank, Initials = entry.Initials, Score = entry.Score };
    }
}
