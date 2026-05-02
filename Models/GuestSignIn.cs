using System.ComponentModel.DataAnnotations;

namespace SunnydaleLibrary.Models;

/// <summary>Form payload posted from the splash sign-in page.</summary>
public class GuestSignIn
{
    [Required, StringLength(80, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    [Required]
    public string Reason { get; set; } = string.Empty;

    [Range(typeof(bool), "true", "true", ErrorMessage = "You must accept the library policy.")]
    public bool TermsAccepted { get; set; }

    public string? Id { get; set; }

    public string? Ap { get; set; }

    public string? T { get; set; }

    public string? Url { get; set; }

    public string? Ssid { get; set; }

    public UnifiRedirectParams ToRedirectParams()
    {
        return new UnifiRedirectParams
        {
            Id = Id,
            Ap = Ap,
            T = T,
            Url = Url,
            Ssid = Ssid
        };
    }
}
