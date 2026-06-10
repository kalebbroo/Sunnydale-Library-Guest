/*
 * Stake Night — the DOM HUD: score, combo, lives, active power-up timers, the stage label,
 * and the boss health bar. updateHud() is called whenever those values change.
 */
namespace SN {
    export const hud = document.getElementById("hud") as HTMLElement;
    export const hudScore = document.getElementById("hud-score") as HTMLElement;
    export const hudCombo = document.getElementById("hud-combo") as HTMLElement;
    export const hudLives = document.getElementById("hud-lives") as HTMLElement;
    export const hudPower = document.getElementById("hud-power") as HTMLElement | null;
    export const hudStage = document.getElementById("hud-stage") as HTMLElement | null;
    export const bossBar = document.getElementById("boss-bar") as HTMLElement | null;
    export const bossName = document.getElementById("boss-name") as HTMLElement | null;
    export const bossFill = document.getElementById("boss-hp-fill") as HTMLElement;

    export function updateHud(): void {
        hudScore.textContent = state.score.toString().padStart(6, "0");
        hudCombo.textContent = state.combo >= 2 ? ("x" + state.combo) : "";
        let bar = ""; for (let i = 0; i < CONFIG.maxLives; i++) { bar += i < state.player.lives ? "▮" : "▯"; }
        hudLives.textContent = bar;
        if (hudPower) {
            const parts: string[] = [];
            const cb = state.player.crossbowUntil - nowMs; if (cb > 0) { parts.push("🏹 " + Math.ceil(cb / 1000)); }
            const scy = state.player.scytheUntil - nowMs; if (scy > 0) { parts.push("⚔ " + Math.ceil(scy / 1000)); }
            hudPower.textContent = parts.join("  ");
        }
        if (hudStage) {
            const s = stage();
            const waves = effectiveWaves(s);
            const waveTag = waves.length > 1 ? "  ·  Wave " + (state.waveIndex + 1) + "/" + waves.length : "";
            hudStage.textContent = s.boss ? s.name + " — BOSS"
                : state.phase === "cleared" ? s.name + " — CLEAR →"
                : s.name + "  " + Math.min(state.defeatedThisStage, s.quota) + "/" + s.quota + waveTag;
        }
        if (bossBar) {
            if (state.boss) { bossBar.classList.remove("hidden"); if (bossName) { bossName.textContent = "The Master — Order of Aurelius"; } bossFill.style.width = Math.max(0, (state.boss.hp / state.boss.maxHp) * 100) + "%"; }
            else { bossBar.classList.add("hidden"); }
        }
    }
}
