using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Utils;
using System.Collections.Concurrent;
using System.Text.RegularExpressions;

namespace SunnydaleLibrary.Services;

/// <summary>
/// SQLite-backed implementation of <see cref="ILeaderboardService"/>. Uses ADO.NET directly
/// (no EF) to stay light, matching the project's no-heavy-framework style.
///
/// Note on trust: a browser game's score is computed client-side and is inherently forgeable.
/// The guards here (initials charset, score clamp, per-client cooldown) are abuse dampening,
/// not real anti-cheat. Server-authoritative scoring is intentionally out of scope for v1.
/// </summary>
public partial class LeaderboardService : ILeaderboardService
{
    public LeaderboardOptions Options { get; }

    public string ConnectionString { get; }

    /// <summary>Last accepted-submit time per client key, for the cooldown check.</summary>
    private readonly ConcurrentDictionary<string, long> _lastSubmitTicks = new();

    [GeneratedRegex("[^A-Z]")]
    private static partial Regex NonLetters();

    public LeaderboardService(IOptions<LeaderboardOptions> options)
    {
        Options = options.Value;
        string path = ResolveDatabasePath(Options.DatabasePath);
        string? dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }
        ConnectionString = new SqliteConnectionStringBuilder
        {
            DataSource = path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        }.ToString();
        Logs.Init($"Leaderboard SQLite at {path}");
    }

    /// <summary>Falls back to /app/data (Docker) or ./data (local) when no path is configured.</summary>
    public static string ResolveDatabasePath(string configured)
    {
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }
        bool isDocker = File.Exists("/.dockerenv");
        string baseDir = isDocker ? "/app/data" : "data";
        return Path.Combine(baseDir, "leaderboard.db");
    }

    public async Task EnsureSchemaAsync(CancellationToken ct)
    {
        await using SqliteConnection conn = new(ConnectionString);
        await conn.OpenAsync(ct);
        SqliteCommand cmd = conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS scores (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                initials    TEXT    NOT NULL,
                score       INTEGER NOT NULL,
                created_utc TEXT    NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_scores_score ON scores (score DESC);
            """;
        await cmd.ExecuteNonQueryAsync(ct);
        Logs.Init("Leaderboard schema ready.");
    }

    public async Task<ScoreSubmissionResult?> SubmitScoreAsync(string initials, int score, string? clientKey, CancellationToken ct)
    {
        string cleanInitials = SanitizeInitials(initials);
        if (cleanInitials.Length == 0)
        {
            Logs.Warning($"Score submit rejected: empty initials after sanitize (raw='{Clip(initials)}').");
            return null;
        }
        if (score < 0 || score > Options.MaxScore)
        {
            Logs.Warning($"Score submit rejected: out-of-range score={score} (max={Options.MaxScore}).");
            return null;
        }
        if (!CheckCooldown(clientKey))
        {
            Logs.Warning($"Score submit rejected: cooldown for client='{clientKey}'.");
            return null;
        }

        DateTimeOffset now = DateTimeOffset.UtcNow;
        await using SqliteConnection conn = new(ConnectionString);
        await conn.OpenAsync(ct);
        SqliteCommand insert = conn.CreateCommand();
        insert.CommandText = "INSERT INTO scores (initials, score, created_utc) VALUES ($i, $s, $t);";
        insert.Parameters.AddWithValue("$i", cleanInitials);
        insert.Parameters.AddWithValue("$s", score);
        insert.Parameters.AddWithValue("$t", now.ToString("O"));
        await insert.ExecuteNonQueryAsync(ct);

        // Rank = number of strictly-higher scores + 1.
        SqliteCommand rankCmd = conn.CreateCommand();
        rankCmd.CommandText = "SELECT COUNT(*) FROM scores WHERE score > $s;";
        rankCmd.Parameters.AddWithValue("$s", score);
        long higher = (long)(await rankCmd.ExecuteScalarAsync(ct) ?? 0L);
        int rank = (int)higher + 1;

        Logs.Info($"Score recorded: {cleanInitials} {score} (rank #{rank}).");
        return new ScoreSubmissionResult
        {
            Entry = new ScoreEntry { Initials = cleanInitials, Score = score, CreatedUtc = now, Rank = rank },
            Rank = rank
        };
    }

    public async Task<IReadOnlyList<ScoreEntry>> GetTopAsync(int count, LeaderboardPeriod period, CancellationToken ct)
    {
        if (count <= 0)
        {
            count = Options.TopCount;
        }
        List<ScoreEntry> results = [];
        await using SqliteConnection conn = new(ConnectionString);
        await conn.OpenAsync(ct);
        SqliteCommand cmd = conn.CreateCommand();
        // Highest score first; older submission wins ties (lower id).
        string where = period == LeaderboardPeriod.Today ? "WHERE created_utc >= $since " : "";
        cmd.CommandText = $"SELECT initials, score, created_utc FROM scores {where}ORDER BY score DESC, id ASC LIMIT $n;";
        if (period == LeaderboardPeriod.Today)
        {
            // UTC midnight today, ISO-8601 to match the stored "O"-format timestamps lexicographically.
            cmd.Parameters.AddWithValue("$since", DateTimeOffset.UtcNow.Date.ToString("O"));
        }
        cmd.Parameters.AddWithValue("$n", count);
        await using SqliteDataReader reader = await cmd.ExecuteReaderAsync(ct);
        int rank = 0;
        while (await reader.ReadAsync(ct))
        {
            rank++;
            results.Add(new ScoreEntry
            {
                Initials = reader.GetString(0),
                Score = reader.GetInt32(1),
                CreatedUtc = DateTimeOffset.TryParse(reader.GetString(2), out DateTimeOffset parsed) ? parsed : default,
                Rank = rank
            });
        }
        return results;
    }

    public async Task<int> GetCountAsync(CancellationToken ct)
    {
        await using SqliteConnection conn = new(ConnectionString);
        await conn.OpenAsync(ct);
        SqliteCommand cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM scores;";
        long total = (long)(await cmd.ExecuteScalarAsync(ct) ?? 0L);
        return (int)total;
    }

    /// <summary>Uppercases and strips to letters, capped at 3 chars (arcade AAA style).</summary>
    public static string SanitizeInitials(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }
        string letters = NonLetters().Replace(raw.ToUpperInvariant(), "");
        return letters.Length <= 3 ? letters : letters[..3];
    }

    /// <summary>Returns true if this client key is allowed to submit now (and records the time).</summary>
    public bool CheckCooldown(string? clientKey)
    {
        if (string.IsNullOrEmpty(clientKey) || Options.SubmitCooldownSeconds <= 0)
        {
            return true;
        }
        long now = Environment.TickCount64;
        long cooldownMs = Options.SubmitCooldownSeconds * 1000L;
        if (_lastSubmitTicks.TryGetValue(clientKey, out long last) && now - last < cooldownMs)
        {
            return false;
        }
        _lastSubmitTicks[clientKey] = now;
        return true;
    }

    public static string Clip(string s)
    {
        return s.Length <= 16 ? s : s[..16] + "...";
    }
}
