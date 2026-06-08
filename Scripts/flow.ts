/*
 * Stake Night — the requestAnimationFrame loop, the stage story overlays, and the run
 * lifecycle: anti-cheat run token, entering/beginning stages, start, advance, and end.
 */
namespace SN {
    // ---- Loop -------------------------------------------------------------
    export let rafId = 0, lastTs = 0, paused = false;
    export function frame(ts: number): void {
        if (!state.running || paused) { return; }
        if (!lastTs) { lastTs = ts; }
        nowMs = ts; let dt = (ts - lastTs) / 1000; lastTs = ts; if (dt > 0.05) { dt = 0.05; }
        if (state.hitStop > 0) { state.hitStop -= dt * 1000; }   // freeze-frame on impact: hold the sim, keep drawing
        else { update(dt); }
        if (state.running && !paused) { render(); rafId = requestAnimationFrame(frame); }
    }

    // ---- Stage flow + lifecycle -------------------------------------------
    export const overlayStart = document.getElementById("overlay-start") as HTMLElement;
    export const overlayOver = document.getElementById("overlay-over") as HTMLElement;
    export const overlayStory = document.getElementById("overlay-story") as HTMLElement | null;
    export const storyTitle = document.getElementById("story-title") as HTMLElement | null;
    export const storyText = document.getElementById("story-text") as HTMLElement | null;
    export const controls = document.getElementById("controls") as HTMLElement | null;
    export const btnThrow = document.getElementById("btn-throw") as HTMLElement | null;
    export let storyContinue: (() => void) | null = null;

    export function requestRunToken(): void {
        fetch("/api/run/start", { method: "POST" }).then(r => r.ok ? r.json() : null)
            .then((d: { token?: string } | null) => { if (d && d.token && state) { state.runToken = d.token; } }).catch(() => { /* offline */ });
    }

    export function showStory(s: Stage, idx: number, onContinue: () => void): void {
        cancelAnimationFrame(rafId);
        paused = true;
        storyContinue = onContinue;
        if (storyTitle) { storyTitle.textContent = "Stage " + (idx + 1) + " · " + s.name; }
        if (storyText) { storyText.textContent = s.story; }
        if (controls) { controls.classList.add("hidden"); }
        if (overlayStory) { overlayStory.classList.remove("hidden"); }
    }
    export function continueStory(): void {
        const cb = storyContinue; storyContinue = null;
        if (overlayStory) { overlayStory.classList.add("hidden"); }
        if (cb) { cb(); }
    }

    export function enterStage(i: number): void {
        state.stageIndex = i;
        state.spawnedThisStage = 0; state.defeatedThisStage = 0; state.exitOpen = false; state.bossSpawned = false;
        state.enemies = []; state.bolts = []; state.pickups = [];
        state.camX = state.player.x - viewW * 0.5;
        seedBackground();
        const s = STAGES[i];
        if (s.levelUp) { state.player.canThrow = true; if (btnThrow) { btnThrow.classList.remove("hidden"); } Sound.sfx.levelup(); }
        showStory(s, i, () => beginStage(s));
    }
    export function beginStage(s: Stage): void {
        state.phase = "playing"; state.spawnTimer = 500;
        if (s.boss) { spawnBoss(); }
        state.banner = { text: s.name, until: nowMs + 2200 };
        Sound.sfx.stage();
        if (controls) { controls.classList.remove("hidden"); controls.setAttribute("aria-hidden", "false"); }
        updateHud();
        paused = false; lastTs = 0; rafId = requestAnimationFrame(frame);
    }

    export function startGame(): void {
        resize(); Sound.resume(); Sound.startMusic();
        state = freshState(); requestRunToken();
        state.running = true;
        held.clear(); input.left = input.right = input.up = input.down = false; input.jumpBufferedAt = -1e9;
        overlayStart.classList.add("hidden"); overlayOver.classList.add("hidden");
        if (btnThrow) { btnThrow.classList.add("hidden"); }
        hud.setAttribute("aria-hidden", "false"); updateHud();
        enterStage(0);
    }
    export function advanceStage(): void {
        if (state.stageIndex + 1 < STAGES.length) { enterStage(state.stageIndex + 1); }
    }

    export function endGame(victory: boolean): void {
        state.running = false; state.victory = victory;
        cancelAnimationFrame(rafId);
        Sound.stopMusic(); if (victory) { Sound.sfx.win(); } else { Sound.sfx.over(); }
        render();
        if (controls) { controls.classList.add("hidden"); controls.setAttribute("aria-hidden", "true"); }
        if (bossBar) { bossBar.classList.add("hidden"); }
        showGameOver(victory);
    }
}
