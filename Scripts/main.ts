/*
 * Stake Night — entry point. Loaded LAST in the concatenated build so every SN.* symbol it
 * wires up (start/again/story buttons, mute, the boot render) is already defined.
 *
 * Build: Scripts/*.ts → wwwroot/js/game.js via tsc (outFile concatenation; see tsconfig.json).
 * The page loads that single file as a plain <script> — no bundler, no module loader.
 */
namespace SN {
    (document.getElementById("btn-start") as HTMLElement).addEventListener("click", startGame);
    (document.getElementById("btn-again") as HTMLElement).addEventListener("click", startGame);
    document.getElementById("btn-story-continue")?.addEventListener("click", continueStory);
    overlayStory?.addEventListener("pointerdown", (e: PointerEvent) => { e.preventDefault(); continueStory(); });

    const btnMute = document.getElementById("btn-mute") as HTMLElement | null;
    function refreshMuteIcon(): void { if (btnMute) { btnMute.textContent = Sound.isMuted() ? "🔇" : "🔊"; } }
    btnMute?.addEventListener("click", () => { Sound.resume(); Sound.toggleMute(); refreshMuteIcon(); Sound.sfx.ui(); });
    refreshMuteIcon();

    // ---- Boot -------------------------------------------------------------
    loadSheets(); resize();
    state = freshState(); state.camX = -viewW * 0.5; seedBackground(); render();
}
