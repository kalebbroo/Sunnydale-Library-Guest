namespace SunnydaleLibrary.Models;

/// <summary>Bound from the "Unifi" config section. Env vars (UNIFI_*) override.</summary>
public class UnifiOptions
{
    public string ControllerUrl { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    public string Site { get; set; } = "default";

    public int DefaultMinutes { get; set; } = 480;

    public bool VerifyTls { get; set; } = false;
}
