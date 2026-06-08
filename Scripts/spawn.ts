/*
 * Stake Night — difficulty ramp, weighted enemy spawning, pickup drops, and boss entrance.
 */
namespace SN {
    export function difficultyT(): number { return Math.min(1, state.elapsed / CONFIG.spawnRampMs); }

    export function pickEnemyType(): string {
        const t = difficultyT();
        const entries = Object.entries(ENEMY_TYPES).map(([k, v]) => [k, Math.max(0, v.weight(t))] as [string, number]);
        const total = entries.reduce((s, [, w]) => s + w, 0);
        let r = Math.random() * total;
        for (const [k, w] of entries) { if ((r -= w) <= 0) { return k; } }
        return "grunt";
    }

    export function spawnEnemy(): void {
        if (state.enemies.length >= CONFIG.maxEnemies) { return; }
        const typeKey = pickEnemyType(); const def = ENEMY_TYPES[typeKey];
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side > 0 ? state.camX + viewW + 50 : state.camX - 50;
        state.enemies.push({
            type: typeKey, x, z: Math.random() * floorDepth(), y: 0, vy: 0, vx: 0, vz: 0, stunUntil: -1e9,
            w: def.w, h: def.h, hp: def.hp, def, wobble: Math.random() * Math.PI * 2,
            contactUntil: -1e9, hitBy: -1, alive: true, anim: "walk", animStart: nowMs,
            phase: "chase", phaseUntil: -1e9, grabbed: false, bounced: false,
        });
        state.spawnedThisStage++;
    }

    export function spawnPickup(): void {
        const roll = Math.random();
        const type: Pickup["type"] = roll < 0.16 ? "heart" : roll < 0.46 ? "crossbow" : roll < 0.73 ? "scythe" : "holy";
        state.pickups.push({ type, x: state.player.x + state.player.facing * (200 + Math.random() * 240), z: Math.random() * floorDepth(), bob: Math.random() * Math.PI * 2, born: nowMs });
    }

    export function spawnBoss(): void {
        const hp = 26;
        state.boss = {
            x: state.camX + viewW + 80, z: floorDepth() * 0.5, y: 0, w: 60, h: 96, hp, maxHp: hp,
            nextDashAt: nowMs + 1800, dashUntil: -1e9, dashVx: 0, dashVz: 0, contactUntil: -1e9, hitBy: -1,
        };
        state.bossSpawned = true;
        Sound.sfx.bossIn();
    }
}
