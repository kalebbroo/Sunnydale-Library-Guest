using dotenv.net;
using Microsoft.AspNetCore.HttpOverrides;
using SunnydaleLibrary.Models;
using SunnydaleLibrary.Services;
using SunnydaleLibrary.Utils;
using System.Net;

namespace SunnydaleLibrary;

public class Program
{
    private static readonly CancellationTokenSource GlobalCancelSource = new();
    public static CancellationToken GlobalProgramCancel = GlobalCancelSource.Token;

    public static void Main(string[] args)
    {
        try
        {
            DotEnv.Load();
            Console.WriteLine(".env file loaded");
        }
        catch (Exception ex)
        {
            Console.WriteLine($".env file not found or failed to load: {ex.Message}");
        }
        Logs.StartLogSaving();
        Logs.Init("Starting Sunnydale Library guest portal...");
        WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
        builder.Logging.ClearProviders();
        builder.Environment.EnvironmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        if (builder.Environment.IsDevelopment())
        {
            Logs.MinimumLevel = Logs.LogLevel.Debug;
            Logs.Debug("Development environment detected - enabling debug logs");
        }
        else
        {
            Logs.MinimumLevel = Logs.LogLevel.Info;
            Logs.Info("Production environment detected");
        }

        Logs.Init("Configuring base services...");
        builder.Services.AddRazorPages(options =>
        {
            // UniFi's external portal redirect format is http://<ip>/guest/s/<site>/?id=...&ap=...
            // Add it as an alias to the Index page so the splash renders for that path too.
            options.Conventions.AddPageRoute("/Index", "/guest/s/{site?}");
        });

        Logs.Init("Binding UniFi options...");
        builder.Services.Configure<UnifiOptions>(opts =>
        {
            builder.Configuration.GetSection("Unifi").Bind(opts);
            // Env-var overrides (UNIFI_*) — these win over appsettings.
            string? controllerUrl = Environment.GetEnvironmentVariable("UNIFI_CONTROLLER_URL");
            if (!string.IsNullOrWhiteSpace(controllerUrl)) { opts.ControllerUrl = controllerUrl; }
            string? username = Environment.GetEnvironmentVariable("UNIFI_USERNAME");
            if (!string.IsNullOrWhiteSpace(username)) { opts.Username = username; }
            string? password = Environment.GetEnvironmentVariable("UNIFI_PASSWORD");
            if (!string.IsNullOrWhiteSpace(password)) { opts.Password = password; }
            string? site = Environment.GetEnvironmentVariable("UNIFI_SITE");
            if (!string.IsNullOrWhiteSpace(site)) { opts.Site = site; }
            string? minutes = Environment.GetEnvironmentVariable("UNIFI_DEFAULT_MINUTES");
            if (int.TryParse(minutes, out int parsedMinutes) && parsedMinutes > 0) { opts.DefaultMinutes = parsedMinutes; }
            string? verifyTls = Environment.GetEnvironmentVariable("UNIFI_VERIFY_TLS");
            if (bool.TryParse(verifyTls, out bool parsedVerifyTls)) { opts.VerifyTls = parsedVerifyTls; }
        });

        Logs.Init("Registering UniFi HTTP client...");
        builder.Services.AddHttpClient<IUnifiClient, UnifiClient>()
            .ConfigurePrimaryHttpMessageHandler(sp =>
            {
                UnifiOptions opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<UnifiOptions>>().Value;
                HttpClientHandler handler = new()
                {
                    UseCookies = true,
                    CookieContainer = new CookieContainer()
                };
                if (!opts.VerifyTls)
                {
                    // UDM SE ships a self-signed cert by default. Explicit opt-in via UNIFI_VERIFY_TLS=true.
                    handler.ServerCertificateCustomValidationCallback = (_, _, _, _) => true;
                }
                return handler;
            });

        Logs.Init("Binding leaderboard options...");
        builder.Services.Configure<LeaderboardOptions>(opts =>
        {
            builder.Configuration.GetSection("Leaderboard").Bind(opts);
            // Env-var overrides (LEADERBOARD_*) — these win over appsettings.
            string? dbPath = Environment.GetEnvironmentVariable("LEADERBOARD_DATABASE_PATH");
            if (!string.IsNullOrWhiteSpace(dbPath)) { opts.DatabasePath = dbPath; }
            string? topCount = Environment.GetEnvironmentVariable("LEADERBOARD_TOP_COUNT");
            if (int.TryParse(topCount, out int parsedTop) && parsedTop > 0) { opts.TopCount = parsedTop; }
            string? maxScore = Environment.GetEnvironmentVariable("LEADERBOARD_MAX_SCORE");
            if (int.TryParse(maxScore, out int parsedMax) && parsedMax > 0) { opts.MaxScore = parsedMax; }
            string? cooldown = Environment.GetEnvironmentVariable("LEADERBOARD_SUBMIT_COOLDOWN_SECONDS");
            if (int.TryParse(cooldown, out int parsedCooldown) && parsedCooldown >= 0) { opts.SubmitCooldownSeconds = parsedCooldown; }
            string? signingKey = Environment.GetEnvironmentVariable("LEADERBOARD_SIGNING_KEY");
            if (!string.IsNullOrWhiteSpace(signingKey)) { opts.SigningKey = signingKey; }
            string? requireToken = Environment.GetEnvironmentVariable("LEADERBOARD_REQUIRE_RUN_TOKEN");
            if (bool.TryParse(requireToken, out bool parsedRequire)) { opts.RequireRunToken = parsedRequire; }
            string? ppsCap = Environment.GetEnvironmentVariable("LEADERBOARD_POINTS_PER_SECOND_CAP");
            if (int.TryParse(ppsCap, out int parsedPps) && parsedPps > 0) { opts.PointsPerSecondCap = parsedPps; }
        });

        Logs.Init("Registering domain services...");
        builder.Services.AddSingleton<ILeaderboardService, LeaderboardService>();
        builder.Services.AddSingleton<IRunTokenService, RunTokenService>();
        builder.Services.AddScoped<IGuestSessionService, GuestSessionService>();

        WebApplication app = builder.Build();

        Logs.Init("Ensuring leaderboard schema...");
        app.Services.GetRequiredService<ILeaderboardService>()
            .EnsureSchemaAsync(GlobalProgramCancel).GetAwaiter().GetResult();

        // If a reverse proxy is added later, honor X-Forwarded-* so Request.Scheme is right.
        ForwardedHeadersOptions forwardedOptions = new()
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
        };
        forwardedOptions.KnownNetworks.Clear();
        forwardedOptions.KnownProxies.Clear();
        app.UseForwardedHeaders(forwardedOptions);

        if (app.Environment.IsDevelopment())
        {
            app.UseDeveloperExceptionPage();
        }
        else
        {
            app.UseExceptionHandler("/Error");
        }

        app.UseStaticFiles();
        app.UseRouting();
        app.MapRazorPages();

        // --- Stake Night leaderboard API (public read, guarded write; consumed by wwwroot/js/game.js) ---

        // Issue a signed run token at the start of a play session (anti-cheat; see RunTokenService).
        app.MapPost("/api/run/start", (IRunTokenService tokens) => Results.Ok(new { token = tokens.Issue() }));

        app.MapGet("/api/scores", async (ILeaderboardService board, int? top, string? period, CancellationToken ct) =>
        {
            LeaderboardPeriod scope = string.Equals(period, "today", StringComparison.OrdinalIgnoreCase)
                ? LeaderboardPeriod.Today : LeaderboardPeriod.AllTime;
            IReadOnlyList<Models.ScoreEntry> entries = await board.GetTopAsync(top ?? 0, scope, ct);
            return Results.Ok(entries.Select(ScoreDto.From));
        });

        app.MapPost("/api/scores", async (ILeaderboardService board, IRunTokenService tokens, Microsoft.Extensions.Options.IOptions<LeaderboardOptions> lbOptions, HttpContext http, ScoreSubmission body, CancellationToken ct) =>
        {
            if (body is null)
            {
                return Results.BadRequest(new { error = "Missing body." });
            }
            if (lbOptions.Value.RequireRunToken)
            {
                (bool ok, string? reason) = tokens.Validate(body.Token, body.Score);
                if (!ok)
                {
                    Logs.Warning($"Score submit rejected by run-token check: {reason} (score={body.Score}).");
                    return Results.BadRequest(new { error = "Score rejected." });
                }
            }
            // Per-client key for the cooldown: prefer the real client IP, fall back to connection id.
            string clientKey = http.Connection.RemoteIpAddress?.ToString() ?? http.Connection.Id;
            ScoreSubmissionResult? result = await board.SubmitScoreAsync(body.Initials ?? "", body.Score, clientKey, ct);
            if (result is null)
            {
                return Results.BadRequest(new { error = "Score rejected." });
            }
            IReadOnlyList<Models.ScoreEntry> topEntries = await board.GetTopAsync(0, LeaderboardPeriod.AllTime, ct);
            return Results.Ok(new
            {
                rank = result.Rank,
                entry = ScoreDto.From(result.Entry),
                top = topEntries.Select(ScoreDto.From)
            });
        });

        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            GlobalCancelSource.Cancel();
        };

        Logs.Init("Sunnydale Library guest portal is open. The library is now closed... wait, that's wrong.");
        app.Run();
    }
}
