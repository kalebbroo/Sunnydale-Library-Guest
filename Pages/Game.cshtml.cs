using Microsoft.AspNetCore.Mvc.RazorPages;

namespace SunnydaleLibrary.Pages;

/// <summary>
/// "Stake Night" — the canvas side-scroller. The page is a thin shell; all game logic lives
/// in wwwroot/js/game.js and talks to the /api/scores endpoints. No server state needed here.
/// </summary>
public class GameModel : PageModel
{
    public void OnGet()
    {
    }
}
