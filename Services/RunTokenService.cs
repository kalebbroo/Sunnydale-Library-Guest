using Microsoft.Extensions.Options;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Utils;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SunnydaleLibrary.Services;

/// <summary>
/// Issues and validates signed, single-use "run tokens" for Stake Night. The game requests a
/// token at the start of a run (/api/run/start); the score submit must carry it back. This makes
/// the leaderboard server-authoritative *enough* to reject obviously-fake submissions:
///
///   - a token is HMAC-signed, so it can't be forged without the server key,
///   - it carries the issue time, so the submitted score is capped at PointsPerSecondCap * elapsed,
///   - it's single-use and time-limited, so it can't be replayed or banked.
///
/// This is not perfect anti-cheat (a determined player can still drive a real session slowly and
/// submit a capped score), but it stops the trivial `curl a million points` attack the v1 board
/// was open to.
/// </summary>
public interface IRunTokenService
{
    /// <summary>Mints a fresh signed token string for a new run.</summary>
    string Issue();

    /// <summary>Validates a token for the given score. Returns (true, null) on success.</summary>
    (bool Ok, string? Reason) Validate(string? token, int score);
}

public class RunTokenService : IRunTokenService
{
    public LeaderboardOptions Options { get; }

    private readonly byte[] _key;

    /// <summary>nonce -> expiry tick (Environment.TickCount64). Presence means "already spent".</summary>
    private readonly ConcurrentDictionary<string, long> _usedNonces = new();

    public RunTokenService(IOptions<LeaderboardOptions> options)
    {
        Options = options.Value;
        if (!string.IsNullOrWhiteSpace(Options.SigningKey))
        {
            _key = Encoding.UTF8.GetBytes(Options.SigningKey);
            Logs.Init("Run-token signing key loaded from config.");
        }
        else
        {
            _key = RandomNumberGenerator.GetBytes(32);
            Logs.Init("Run-token signing key generated (ephemeral — tokens reset on restart).");
        }
    }

    public string Issue()
    {
        // Payload: issue time (unix ms) + random nonce. Compact JSON keeps the token small.
        long issuedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        string nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(8));
        string payloadJson = JsonSerializer.Serialize(new TokenPayload { T = issuedAt, N = nonce });
        byte[] payloadBytes = Encoding.UTF8.GetBytes(payloadJson);
        string payload = Base64Url(payloadBytes);
        string sig = Base64Url(Sign(payloadBytes));
        return $"{payload}.{sig}";
    }

    public (bool Ok, string? Reason) Validate(string? token, int score)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return (false, "missing token");
        }
        string[] parts = token.Split('.');
        if (parts.Length != 2)
        {
            return (false, "malformed token");
        }
        byte[] payloadBytes;
        byte[] sigBytes;
        try
        {
            payloadBytes = FromBase64Url(parts[0]);
            sigBytes = FromBase64Url(parts[1]);
        }
        catch (FormatException)
        {
            return (false, "malformed token");
        }
        // Constant-time signature check.
        if (!CryptographicOperations.FixedTimeEquals(sigBytes, Sign(payloadBytes)))
        {
            return (false, "bad signature");
        }

        TokenPayload? payload;
        try
        {
            payload = JsonSerializer.Deserialize<TokenPayload>(Encoding.UTF8.GetString(payloadBytes));
        }
        catch (JsonException)
        {
            return (false, "bad payload");
        }
        if (payload is null || string.IsNullOrEmpty(payload.N))
        {
            return (false, "bad payload");
        }

        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        double elapsedSec = (nowMs - payload.T) / 1000.0;
        if (elapsedSec < -5)
        {
            return (false, "token from the future");
        }
        if (elapsedSec > Options.TokenMaxAgeSeconds)
        {
            return (false, "token expired");
        }
        if (elapsedSec < Options.MinPlaySeconds)
        {
            return (false, "submitted too fast");
        }
        double maxPlausible = elapsedSec * Options.PointsPerSecondCap;
        if (score > maxPlausible)
        {
            return (false, $"score implausible for {elapsedSec:0}s of play");
        }

        // Single-use: claim the nonce. TryAdd fails if already spent.
        PruneNonces(nowMs);
        long expiry = Environment.TickCount64 + Options.TokenMaxAgeSeconds * 1000L;
        if (!_usedNonces.TryAdd(payload.N, expiry))
        {
            return (false, "token already used");
        }
        return (true, null);
    }

    private void PruneNonces(long nowMs)
    {
        if (_usedNonces.Count < 4096)
        {
            return;
        }
        long now = Environment.TickCount64;
        foreach (KeyValuePair<string, long> kv in _usedNonces)
        {
            if (kv.Value < now)
            {
                _usedNonces.TryRemove(kv.Key, out _);
            }
        }
    }

    private byte[] Sign(byte[] payload)
    {
        using HMACSHA256 hmac = new(_key);
        return hmac.ComputeHash(payload);
    }

    public static string Base64Url(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static byte[] FromBase64Url(string s)
    {
        string b64 = s.Replace('-', '+').Replace('_', '/');
        switch (b64.Length % 4)
        {
            case 2: b64 += "=="; break;
            case 3: b64 += "="; break;
        }
        return Convert.FromBase64String(b64);
    }

    public class TokenPayload
    {
        /// <summary>Issued-at, unix milliseconds.</summary>
        [System.Text.Json.Serialization.JsonPropertyName("t")] public long T { get; set; }

        /// <summary>Random nonce (hex) for single-use enforcement.</summary>
        [System.Text.Json.Serialization.JsonPropertyName("n")] public string N { get; set; } = string.Empty;
    }
}
