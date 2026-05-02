using SunnydaleLibrary.Models;

namespace SunnydaleLibrary.Services;

/// <summary>Day-1 no-op implementation of <see cref="IEasterEggService"/>. Replace tier by tier later.</summary>
public class NullEasterEggService : IEasterEggService
{
    public Task RecordSignInAsync(GuestSignIn form, CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}
