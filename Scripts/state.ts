/*
 * Stake Night — the mutable game state and its fresh-start factories, plus the parallax
 * background seeding (stars + gravestones) sized to the current viewport.
 */
namespace SN {
    export let state!: GameState;
    export let projHitId = -1;

    export function freshPlayer(): Player {
        return {
            x: 0, z: floorDepth() * 0.5, y: 0, vy: 0, w: 30, h: 64, facing: 1, moving: false,
            onGround: true, lastGroundMs: 0, attackUntil: -1e9, lastAttackMs: -1e9, hurtUntil: -1e9,
            hitstunUntil: -1e9, knockVx: 0, knockVz: 0, chain: 0, chainAt: -1e9, grabbing: null, grabUntil: -1e9,
            crossbowUntil: -1e9, scytheUntil: -1e9, canThrow: false, lastThrowMs: -1e9,
            lives: CONFIG.startLives, anim: "idle", animStart: 0,
        };
    }
    export function freshState(): GameState {
        return {
            running: false, phase: "playing", score: 0, combo: 0, bestCombo: 0, elapsed: 0,
            stageIndex: 0, spawnedThisStage: 0, defeatedThisStage: 0,
            exitOpen: false, exitX: 0, bossSpawned: false, victory: false,
            tookDamageThisStage: false, arenaLocked: false, arenaMaxX: 0, waveIndex: 0,
            spawnTimer: 700, pickupTimer: CONFIG.pickupEveryMs, camX: 0, attackId: 0, flash: 0, hitStop: 0,
            player: freshPlayer(), enemies: [], pickups: [], bolts: [], dust: [], stars: [], graves: [],
            boss: null, popups: [], banner: null, shake: 0, runToken: null,
        };
    }

    export function seedBackground(): void {
        state.stars = [];
        const count = Math.round((viewW * floorTopY()) / 9000);
        for (let i = 0; i < count; i++) { state.stars.push({ x: Math.random() * viewW, y: Math.random() * floorTopY() * 0.9, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2, par: 0.2 + Math.random() * 0.2 }); }
        state.graves = [];
        const graveCount = Math.max(6, Math.round(viewW / 120));
        for (let i = 0; i < graveCount * 3; i++) { state.graves.push({ x: (i - graveCount) * 150 + Math.random() * 90, w: 30 + Math.random() * 26, h: 40 + Math.random() * 34, par: 0.5 }); }
    }
}
