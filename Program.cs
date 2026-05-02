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
        builder.Services.AddRazorPages();

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

        Logs.Init("Registering domain services...");
        builder.Services.AddSingleton<IEasterEggService, NullEasterEggService>();
        builder.Services.AddScoped<IGuestSessionService, GuestSessionService>();

        WebApplication app = builder.Build();

        // Cloudflare tunnel terminates TLS upstream; honor X-Forwarded-* so Request.Scheme is right.
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

        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            GlobalCancelSource.Cancel();
        };

        Logs.Init("Sunnydale Library guest portal is open. The library is now closed... wait, that's wrong.");
        app.Run();
    }
}
