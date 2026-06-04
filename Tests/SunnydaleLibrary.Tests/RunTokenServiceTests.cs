using Microsoft.Extensions.Options;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Services;
using Xunit;

namespace SunnydaleLibrary.Tests;

public class RunTokenServiceTests
{
    private static readonly DateTimeOffset Base = new(2026, 6, 3, 12, 0, 0, TimeSpan.Zero);

    private static RunTokenService Make(Action<LeaderboardOptions>? configure = null)
    {
        LeaderboardOptions opts = new()
        {
            SigningKey = "unit-test-signing-key",
            MinPlaySeconds = 2,
            PointsPerSecondCap = 100,
            TokenMaxAgeSeconds = 3600,
        };
        configure?.Invoke(opts);
        return new RunTokenService(Options.Create(opts));
    }

    [Fact]
    public void Validate_AcceptsOwnToken_AfterEnoughElapsedTime()
    {
        RunTokenService svc = Make();
        svc.Clock = () => Base;
        string token = svc.Issue();

        svc.Clock = () => Base.AddSeconds(5);               // 5s elapsed → cap 500 points
        (bool ok, string? reason) = svc.Validate(token, 400);

        Assert.True(ok);
        Assert.Null(reason);
    }

    [Fact]
    public void Validate_RejectsMissingToken()
    {
        (bool ok, string? reason) = Make().Validate(null, 100);
        Assert.False(ok);
        Assert.Equal("missing token", reason);
    }

    [Fact]
    public void Validate_RejectsMalformedToken()
    {
        (bool ok, _) = Make().Validate("not-a-valid-token", 100);
        Assert.False(ok);
    }

    [Fact]
    public void Validate_RejectsTamperedSignature()
    {
        RunTokenService svc = Make();
        svc.Clock = () => Base;
        string token = svc.Issue();
        // Flip the final signature character.
        char last = token[^1];
        string tampered = token[..^1] + (last == 'A' ? 'B' : 'A');

        svc.Clock = () => Base.AddSeconds(5);
        (bool ok, string? reason) = svc.Validate(tampered, 100);

        Assert.False(ok);
        Assert.Equal("bad signature", reason);
    }

    [Fact]
    public void Validate_RejectsSubmitTooFast()
    {
        RunTokenService svc = Make();           // MinPlaySeconds = 2
        svc.Clock = () => Base;
        string token = svc.Issue();

        svc.Clock = () => Base.AddSeconds(1);   // only 1s elapsed
        (bool ok, string? reason) = svc.Validate(token, 10);

        Assert.False(ok);
        Assert.Equal("submitted too fast", reason);
    }

    [Fact]
    public void Validate_RejectsImplausibleScore()
    {
        RunTokenService svc = Make();           // 100 pts/sec cap
        svc.Clock = () => Base;
        string token = svc.Issue();

        svc.Clock = () => Base.AddSeconds(5);   // cap = 500
        (bool ok, string? reason) = svc.Validate(token, 10_000);

        Assert.False(ok);
        Assert.Contains("implausible", reason);
    }

    [Fact]
    public void Validate_RejectsReplayedToken()
    {
        RunTokenService svc = Make();
        svc.Clock = () => Base;
        string token = svc.Issue();

        svc.Clock = () => Base.AddSeconds(5);
        (bool firstOk, _) = svc.Validate(token, 400);
        (bool secondOk, string? reason) = svc.Validate(token, 400);

        Assert.True(firstOk);
        Assert.False(secondOk);
        Assert.Equal("token already used", reason);
    }

    [Fact]
    public void Validate_RejectsExpiredToken()
    {
        RunTokenService svc = Make(o => o.TokenMaxAgeSeconds = 60);
        svc.Clock = () => Base;
        string token = svc.Issue();

        svc.Clock = () => Base.AddSeconds(120);   // older than max age
        (bool ok, string? reason) = svc.Validate(token, 10);

        Assert.False(ok);
        Assert.Equal("token expired", reason);
    }

    [Fact]
    public void Validate_RejectsTokenFromTheFuture()
    {
        RunTokenService svc = Make();
        svc.Clock = () => Base;
        string token = svc.Issue();

        svc.Clock = () => Base.AddSeconds(-30);   // clock moved backwards past skew
        (bool ok, string? reason) = svc.Validate(token, 10);

        Assert.False(ok);
        Assert.Equal("token from the future", reason);
    }

    [Fact]
    public void DifferentServiceInstance_CannotValidate_WhenKeysDiffer()
    {
        RunTokenService issuer = Make(o => o.SigningKey = "key-A");
        issuer.Clock = () => Base;
        string token = issuer.Issue();

        RunTokenService other = Make(o => o.SigningKey = "key-B");
        other.Clock = () => Base.AddSeconds(5);
        (bool ok, string? reason) = other.Validate(token, 100);

        Assert.False(ok);
        Assert.Equal("bad signature", reason);
    }
}
