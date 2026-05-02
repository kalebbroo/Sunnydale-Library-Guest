namespace SunnydaleLibrary.Models;

// TODO(easter-egg-tier3): rotating Watcher's Journal entry shown on /restricted-section.
// Date-keyed so the same day always shows the same entry; rotates daily.
public class WatchersJournalEntry
{
    public DateOnly Date { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;
}
