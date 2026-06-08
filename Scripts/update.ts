/*
 * Stake Night — the per-frame simulation: player movement/jump, camera, spawning cadence,
 * enemy AI + contact, projectiles, pickups, particles, the boss, and the stage-clear flow.
 */
namespace SN {
    export function update(dt: number): void {
        state.elapsed += dt * 1000;
        const p = state.player;

        if (nowMs < p.hitstunUntil) {
            // Knocked back and briefly out of control after a hit.
            p.x += p.knockVx * dt; p.z += p.knockVz * dt;
            const kf = Math.min(1, CONFIG.knockFriction * dt); p.knockVx -= p.knockVx * kf; p.knockVz -= p.knockVz * kf;
            p.z = Math.max(0, Math.min(floorDepth(), p.z));
            p.moving = false;
        } else {
            const dirX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            const dirZ = (input.down ? 1 : 0) - (input.up ? 1 : 0);
            p.x += dirX * CONFIG.moveSpeed * dt;
            p.z += dirZ * CONFIG.moveSpeed * CONFIG.depthScale * dt;
            p.z = Math.max(0, Math.min(floorDepth(), p.z));
            if (dirX !== 0) { p.facing = dirX; }
            p.moving = (dirX !== 0 || dirZ !== 0);

            const canCoyote = p.onGround || (nowMs - p.lastGroundMs) < CONFIG.coyoteMs;
            if (nowMs - input.jumpBufferedAt < CONFIG.jumpBufferMs && canCoyote) { p.vy = CONFIG.jumpVel; p.onGround = false; input.jumpBufferedAt = -1e9; p.lastGroundMs = -1e9; Sound.sfx.jump(); }
        }
        p.vy -= CONFIG.gravity * dt; p.y += p.vy * dt; p.onGround = false;
        if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; p.lastGroundMs = nowMs; }

        if (nowMs >= p.attackUntil) {
            const want = nowMs < p.hurtUntil ? "hurt" : (p.moving ? "walk" : "idle");
            if (p.anim !== want) { p.anim = want; p.animStart = nowMs; }
        }

        state.camX += (p.x - viewW * 0.5 - state.camX) * Math.min(1, CONFIG.camLerp * dt);

        // Spawn toward this stage's quota (combat stages only).
        if (state.phase === "playing" && !stage().boss && state.spawnedThisStage < stage().quota) {
            state.spawnTimer -= dt * 1000;
            if (state.spawnTimer <= 0) { spawnEnemy(); state.spawnTimer = CONFIG.spawnStartMs + (CONFIG.spawnMinMs - CONFIG.spawnStartMs) * difficultyT(); }
        }
        state.pickupTimer -= dt * 1000;
        if (state.pickupTimer <= 0) { spawnPickup(); state.pickupTimer = CONFIG.pickupEveryMs; }

        // Enemies: knockback while stunned, else run the attack state machine — chase to a
        // standoff distance, telegraph a wind-up, strike, recover. Touching the player never
        // damages; only a landed strike does, and the wind-up is a real window to dodge.
        let attackers = 0;
        for (const e of state.enemies) { if (e.alive && (e.phase === "windup" || e.phase === "active")) { attackers++; } }
        for (const e of state.enemies) {
            if (!e.alive) { continue; }
            if (nowMs < e.stunUntil) {
                e.x += e.vx * dt; e.z += e.vz * dt;
                const f = Math.min(1, CONFIG.knockFriction * dt); e.vx -= e.vx * f; e.vz -= e.vz * f;
                e.z = Math.max(0, Math.min(floorDepth(), e.z));
                continue;
            }
            const dx = p.x - e.x, dz = p.z - e.z;
            const adx = Math.abs(dx), adz = Math.abs(dz);
            e.wobble += dt * 6;

            if (e.phase === "chase") {
                const aligned = adx < CONFIG.enemyAttackRangeX && adz < CONFIG.enemyAttackBandZ;
                if (aligned && nowMs > e.phaseUntil && attackers < CONFIG.maxAttackers) {
                    e.phase = "windup"; e.phaseUntil = nowMs + e.def.windup; attackers++;
                    e.anim = "attack"; e.animStart = nowMs;
                } else {
                    // Close in along x only until standoff, and align in z — keeps them spaced
                    // around the player instead of body-blocking on one point.
                    if (adx > CONFIG.enemyStandoff) { e.x += Math.sign(dx) * e.def.speed * dt; }
                    if (adz > 2) { e.z += Math.sign(dz) * e.def.speed * CONFIG.depthScale * dt; }
                    if (e.anim !== "walk") { e.anim = "walk"; e.animStart = nowMs; }
                }
            } else if (e.phase === "windup") {
                if (nowMs >= e.phaseUntil) {
                    // The strike resolves now; a small lunge sells it. Damage only if the player
                    // is still in reach (they had the whole wind-up to step out) and not airborne.
                    e.x += Math.sign(dx || 1) * 6;
                    if (adx < CONFIG.enemyAttackRangeX + e.w * 0.4 && adz < CONFIG.enemyAttackBandZ && p.y < 42) { hurtPlayer(e.x, e.z, e.def.knock); }
                    else { Sound.sfx.whiff(); }
                    e.phase = "active"; e.phaseUntil = nowMs + CONFIG.enemyActiveMs;
                }
            } else if (e.phase === "active") {
                if (nowMs >= e.phaseUntil) { e.phase = "recover"; e.phaseUntil = nowMs + e.def.recover; e.anim = "idle"; e.animStart = nowMs; }
            } else { // recover
                if (nowMs >= e.phaseUntil) { e.phase = "chase"; }
            }
        }
        // Gentle separation along z so vamps fan out instead of stacking (skip stunned/striking).
        for (const e of state.enemies) {
            if (!e.alive || nowMs < e.stunUntil || e.phase === "windup" || e.phase === "active") { continue; }
            for (const o of state.enemies) {
                if (o === e || !o.alive) { continue; }
                if (Math.abs(e.x - o.x) < CONFIG.enemySeparation && Math.abs(e.z - o.z) < CONFIG.enemySeparation * 0.7) {
                    e.z += (Math.sign(e.z - o.z) || 1) * (CONFIG.enemySeparation - Math.abs(e.z - o.z)) * dt * 3;
                    e.z = Math.max(0, Math.min(floorDepth(), e.z));
                }
            }
        }
        state.enemies = state.enemies.filter(e => e.alive);

        if (state.boss) { updateBoss(dt); }

        // Bolts / thrown stakes.
        for (const b of state.bolts) {
            b.x += b.vx * dt; b.spin += dt * 18;
            for (const e of state.enemies) { if (e.alive && Math.abs(e.x - b.x) < e.w * 0.6 && Math.abs(e.z - b.z) < 22) { hitEnemy(e, projHitId--); b.alive = false; break; } }
            if (b.alive && state.boss && Math.abs(state.boss.x - b.x) < state.boss.w * 0.6 && Math.abs(state.boss.z - b.z) < 26) { damageBoss(1); b.alive = false; }
            if (Math.abs(b.x - p.x) > viewW) { b.alive = false; }
        }
        state.bolts = state.bolts.filter(b => b.alive);

        for (const pk of state.pickups) { pk.bob += dt * 4; if (Math.abs(pk.x - p.x) < 28 && Math.abs(pk.z - p.z) < 24) { pk.taken = true; applyPickup(pk); } }
        state.pickups = state.pickups.filter(pk => !pk.taken && Math.abs(pk.x - p.x) < viewW * 1.4 && nowMs - pk.born < 20000);

        for (const d of state.dust) { d.life += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 220 * dt; }
        state.dust = state.dust.filter(d => d.life < d.max);
        for (const pop of state.popups) { pop.life += dt; pop.y += pop.vy * dt; pop.vy += 40 * dt; }
        state.popups = state.popups.filter(pop => pop.life < pop.max);
        if (state.flash > 0) { state.flash = Math.max(0, state.flash - dt * 2); }
        if (state.shake > 0) { state.shake = Math.max(0, state.shake - dt * 40); }
        if (state.banner && nowMs > state.banner.until) { state.banner = null; }

        const powerActive = nowMs < p.crossbowUntil || nowMs < p.scytheUntil;
        if (powerActive) { p._wasPower = true; updateHud(); } else if (p._wasPower) { p._wasPower = false; updateHud(); }

        // --- Stage flow: clear → open exit; walk east → next stage ---
        if (state.phase === "playing" && !stage().boss && state.defeatedThisStage >= stage().quota && state.enemies.length === 0 && !state.exitOpen) {
            state.exitOpen = true; state.exitX = p.x + CONFIG.exitWalk;
            state.banner = { text: "Cleared — head east →", until: nowMs + 4000 };
            state.phase = "cleared";
        }
        if (state.phase === "cleared" && p.x >= state.exitX) { advanceStage(); }
    }

    export function updateBoss(dt: number): void {
        const b = state.boss; if (!b) { return; }
        const p = state.player;
        if (nowMs < b.dashUntil) { b.x += b.dashVx * dt; b.z += b.dashVz * dt; }
        else {
            const dx = p.x - b.x, dz = p.z - b.z, dist = Math.hypot(dx, dz) || 1;
            b.x += (dx / dist) * CONFIG.bossSpeed * dt; b.z += (dz / dist) * CONFIG.bossSpeed * CONFIG.depthScale * dt;
            if (nowMs >= b.nextDashAt) { b.dashUntil = nowMs + 380; b.dashVx = (dx / dist) * CONFIG.bossDashSpeed; b.dashVz = (dz / dist) * CONFIG.bossDashSpeed * CONFIG.depthScale; b.nextDashAt = nowMs + 2200; }
        }
        b.z = Math.max(0, Math.min(floorDepth(), b.z));
        if (Math.abs(b.x - p.x) < (b.w + p.w) * 0.5 && Math.abs(b.z - p.z) < 24 && nowMs > b.contactUntil) { b.contactUntil = nowMs + 800; hurtPlayer(b.x, b.z, CONFIG.playerKnock * 1.6); }
    }
}
