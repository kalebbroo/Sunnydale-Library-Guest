namespace SunnydaleLibrary.Models;

// TODO(easter-egg-tier2): full model for the card-catalog page. Title, author, deweyDecimal,
// isCheckedOut, lastCheckedOutBy ("Buffy Summers"), watchersNotes, etc. Surface via IEasterEggService.
public class CatalogEntry
{
    public string Title { get; set; } = string.Empty;

    public string Author { get; set; } = string.Empty;

    public string DeweyDecimal { get; set; } = string.Empty;
}
