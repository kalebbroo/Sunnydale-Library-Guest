using System.Text.RegularExpressions;

namespace SunnydaleLibrary.Models;

/// <summary>Query-string parameters UniFi appends when redirecting an unauthorized client to the external portal.</summary>
public class UnifiRedirectParams
{
    /// <summary>Client device MAC address.</summary>
    public string? Id { get; set; }

    /// <summary>Access point MAC address.</summary>
    public string? Ap { get; set; }

    /// <summary>Timestamp UniFi issued the redirect.</summary>
    public string? T { get; set; }

    /// <summary>Original URL the user was trying to reach.</summary>
    public string? Url { get; set; }

    /// <summary>SSID the client connected to.</summary>
    public string? Ssid { get; set; }

    private static readonly Regex MacShape = new("^[0-9a-fA-F]{2}([:-]?[0-9a-fA-F]{2}){5}$", RegexOptions.Compiled);

    public bool HasValidClientMac()
    {
        return !string.IsNullOrWhiteSpace(Id) && MacShape.IsMatch(Id);
    }

    public static UnifiRedirectParams FromQuery(IQueryCollection query)
    {
        return new UnifiRedirectParams
        {
            Id = query["id"].ToString(),
            Ap = query["ap"].ToString(),
            T = query["t"].ToString(),
            Url = query["url"].ToString(),
            Ssid = query["ssid"].ToString()
        };
    }
}
