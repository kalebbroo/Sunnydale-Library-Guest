/*
 * Stake Night — attacks, throws, projectile fire, knockback, damage resolution (enemies, boss,
 * player), pickups, and the dust/score-popup particle spawners.
 */
namespace SN {
    export function tryAttack(): void {
        if (!state || !state.running) { return; }
        const p = state.player;
        if (nowMs < p.hitstunUntil) { return; }   // can't attack while knocked back
        if (p.grabbing) { throwGrabbed(); return; }   // HIT while holding a vamp → throw it
        if (nowMs - p.lastAttackMs < CONFIG.attackCooldownMs) { return; }
        p.lastAttackMs = nowMs; p.attackUntil = nowMs + CONFIG.attackMs;
        state.attackId++;
        if (nowMs < p.crossbowUntil) { p.anim = "attack"; p.animStart = nowMs; fire("bolt"); Sound.sfx.shoot(); return; }

        // On the ground next to a downed/stunned vamp? Grab it instead of swinging.
        if (p.onGround && tryGrab()) { return; }

        const airborne = !p.onGround;
        if (nowMs - p.chainAt > CONFIG.chainWindowMs) { p.chain = 0; }     // stale chain resets
        const finisher = ((p.chain + 1) % CONFIG.finisherEvery) === 0;     // every Nth connected hit
        p.anim = airborne ? "jump" : "attack"; p.animStart = nowMs;

        const scythe = nowMs < p.scytheUntil;
        let reach = scythe ? CONFIG.attackReachX * CONFIG.scytheReachMult : CONFIG.attackReachX;
        let band = scythe ? CONFIG.attackBandZ * 1.6 : CONFIG.attackBandZ;
        if (airborne) { reach = Math.max(reach, CONFIG.jumpAtkReachX); band = Math.max(band, CONFIG.jumpAtkBandZ); }  // jump attack: wider, downward
        const cx = p.x + p.facing * (reach * 0.5 + p.w * 0.5);
        let hitAny = false;
        for (const e of state.enemies) {
            if (!e.alive || e.hitBy === state.attackId) { continue; }
            if (Math.abs(e.x - cx) < reach * 0.5 + e.w * 0.5 && Math.abs(e.z - p.z) < band && (e.x - p.x) * p.facing > -8) {
                // A finisher, jump attack, or scythe breaks a guard; a plain hit does not.
                if (hitEnemy(e, state.attackId, scythe, finisher, finisher || airborne || scythe)) { hitAny = true; }
            }
        }
        if (state.boss) {
            const b = state.boss;
            if (Math.abs(b.x - cx) < reach * 0.5 + b.w * 0.5 && Math.abs(b.z - p.z) < band + 10 && (b.x - p.x) * p.facing > -8 && b.hitBy !== state.attackId) { b.hitBy = state.attackId; damageBoss(scythe ? 3 : 1); hitAny = true; }
        }
        if (hitAny) {
            p.chain++; p.chainAt = nowMs;
            if (finisher) { Sound.sfx.finisher(); state.shake = Math.max(state.shake, 8); spawnPopup(p.x, feetY(p.z, 0) - p.h - 22, FINISHER_QUIPS[Math.floor(Math.random() * FINISHER_QUIPS.length)]); }
            if (airborne) { p.vy = CONFIG.jumpAtkBounce; p.onGround = false; }   // pogo off the hit
        } else { state.combo = 0; p.chain = 0; Sound.sfx.whiff(); updateHud(); }
    }

    // ---- Grab & throw -----------------------------------------------------
    // Grab the nearest downed/stunned vamp in front of the player; returns true if one was grabbed.
    export function tryGrab(): boolean {
        const p = state.player;
        let best: Enemy | null = null, bestDx = 1e9;
        for (const e of state.enemies) {
            if (!e.alive || e.grabbed) { continue; }
            const grabbable = e.phase === "down" || e.phase === "getup" || nowMs < e.stunUntil;
            if (!grabbable) { continue; }
            const dx = e.x - p.x;
            if (Math.abs(dx) < CONFIG.grabRangeX + e.w * 0.5 && Math.abs(e.z - p.z) < CONFIG.grabRangeZ && dx * p.facing > -10 && Math.abs(dx) < bestDx) { best = e; bestDx = Math.abs(dx); }
        }
        if (!best) { return false; }
        best.grabbed = true; best.phase = "chase"; best.vx = 0; best.vy = 0; best.y = 0; best.stunUntil = -1e9;
        p.grabbing = best; p.grabUntil = nowMs + CONFIG.grabHoldMs;
        p.anim = "throw"; p.animStart = nowMs;
        Sound.sfx.pickup();
        return true;
    }
    export function throwGrabbed(): void {
        const p = state.player; const e = p.grabbing; if (!e) { return; }
        p.grabbing = null; p.anim = "throw"; p.animStart = nowMs; p.lastAttackMs = nowMs; p.attackUntil = nowMs + CONFIG.attackMs;
        e.grabbed = false; e.phase = "thrown"; e.bounced = false; e.hitBy = projHitId--;
        e.vx = p.facing * CONFIG.throwSpeedX; e.vy = CONFIG.throwPop; e.y = e.h * 0.4; e.anim = "knockdown"; e.animStart = nowMs;
        state.shake = Math.max(state.shake, 6); Sound.sfx.shoot();
    }

    export function tryThrow(): void {
        if (!state || !state.running) { return; }
        const p = state.player;
        if (!p.canThrow || nowMs - p.lastThrowMs < CONFIG.throwCooldownMs) { return; }
        p.lastThrowMs = nowMs; p.attackUntil = nowMs + CONFIG.attackMs; p.anim = "throw"; p.animStart = nowMs;
        fire("stake"); Sound.sfx.shoot();
        if (Math.random() < 0.34) { spawnPopup(p.x, feetY(p.z, 0) - p.h - 18, "Mr. Pointy!"); }
    }

    export function fire(kind: "bolt" | "stake"): void {
        const p = state.player;
        const speed = kind === "stake" ? CONFIG.throwSpeed : CONFIG.boltSpeed;
        state.bolts.push({ kind, x: p.x + p.facing * 18, z: p.z, y: p.h * 0.55, vx: p.facing * speed, spin: 0, alive: true });
    }

    export function knockback(e: Enemy, lethal: boolean, finisher: boolean = false): void {
        const p = state.player;
        const dirx = (Math.sign(e.x - p.x) || p.facing);
        const resist = e.type === "brute" ? 0.45 : 1;
        if (finisher && !lethal) {
            // Finisher launches a surviving vamp into a knockdown (pop + arc + slide + lie + getup).
            e.phase = "down"; e.phaseUntil = nowMs + CONFIG.downLieMs; e.bounced = false;
            e.vx = dirx * CONFIG.downKnock * resist; e.vy = CONFIG.downPop * (e.type === "brute" ? 0.7 : 1); e.vz = 0;
            e.anim = "knockdown"; e.animStart = nowMs; e.stunUntil = -1e9;
        } else {
            e.vx = dirx * CONFIG.knockImpulse * resist * (lethal ? 1.5 : 1);
            e.vz = (e.z - p.z >= 0 ? 1 : -1) * 40 * resist;
            e.stunUntil = nowMs + CONFIG.stunMs;
        }
    }

    // Returns true if the hit connected (false if a guard absorbed it — that shouldn't advance the
    // player's combo). `breakGuard` (finisher / jump-attack / scythe) smashes through a block.
    export function hitEnemy(e: Enemy, attackId: number, lethal: boolean = false, finisher: boolean = false, breakGuard: boolean = false): boolean {
        e.hitBy = attackId;
        if (e.phase === "block" && !breakGuard) {
            // Guarded: no damage, a spark, and a little shove for both.
            const dirx = Math.sign(e.x - state.player.x) || state.player.facing;
            e.x += dirx * 6; e.phaseUntil = Math.max(e.phaseUntil, nowMs + 120);
            spawnDust(e.x - dirx * e.w * 0.4, feetY(e.z, 0) - e.h * 0.6, 4, "#cfe8ff"); Sound.sfx.whiff();
            return false;
        }
        Sound.sfx.hit();   // connects (incl. a broken guard)
        state.hitStop = Math.max(state.hitStop, finisher ? CONFIG.finisherHitStopMs : CONFIG.hitStopMs);
        if (e.phase === "windup" || e.phase === "active" || e.phase === "recover" || e.phase === "block") { e.phase = "chase"; e.phaseUntil = nowMs + 220; }
        if (lethal) { e.hp = 1; }
        e.hp--;
        const dead = e.hp <= 0;
        knockback(e, dead, finisher);
        if (!dead) {
            if (e.phase !== "down") { spawnDust(e.x, feetY(e.z, 0) - e.h * 0.5, 6, "#8a6a9a"); e.anim = "hurt"; e.animStart = nowMs; }
            return true;
        }
        e.alive = false;
        state.defeatedThisStage++;
        state.combo++; state.bestCombo = Math.max(state.bestCombo, state.combo);
        const gained = Math.round(e.def.points * (1 + Math.floor(state.combo / 5) * 0.5));
        state.score += gained;
        spawnDust(e.x, feetY(e.z, 0) - e.h * 0.5, 16, "#c9b8d6");
        spawnPopup(e.x, feetY(e.z, 0) - e.h, "+" + gained);
        updateHud();
        return true;
    }

    export function damageBoss(n: number): void {
        const b = state.boss; if (!b) { return; }
        b.hp -= n; spawnDust(b.x, feetY(b.z, 0) - b.h * 0.5, 8, "#ff7b7b");
        if (b.hp <= 0) {
            state.score += 2500; state.combo += 5;
            spawnDust(b.x, feetY(b.z, 0) - b.h * 0.5, 40, "#f4ecc6");
            spawnPopup(b.x, feetY(b.z, 0) - b.h, "+2500");
            state.flash = 0.9; state.shake = Math.max(state.shake, 18); state.hitStop = Math.max(state.hitStop, 140);
            Sound.sfx.bossDown(); state.boss = null;
            endGame(true);   // boss only exists on the finale stage → victory
        }
        updateHud();
    }

    // Called only when an enemy/boss strike actually lands. i-frames (iframesMs) make the player
    // invulnerable for ~1s afterwards; hitstun briefly takes control away and shoves them back,
    // away from the attacker — TMNT/Streets-of-Rage style.
    export function hurtPlayer(srcX?: number, srcZ?: number, power: number = CONFIG.playerKnock): void {
        const p = state.player;
        if (nowMs < p.hurtUntil) { return; }   // still invulnerable from the last hit
        const heavy = power >= CONFIG.heavyHitKnock;   // brute / boss / thrown body → knockdown
        p.hurtUntil = nowMs + CONFIG.iframesMs; p.hitstunUntil = nowMs + (heavy ? CONFIG.knockdownMs : CONFIG.hitstunMs);
        p.lives--; state.combo = 0; p.chain = 0; state.tookDamageThisStage = true;
        if (p.grabbing) { p.grabbing.grabbed = false; p.grabbing.phase = "chase"; p.grabbing = null; }   // drop the grab
        const dirX = srcX != null ? (Math.sign(p.x - srcX) || -p.facing) : -p.facing;
        p.knockVx = dirX * power;
        p.knockVz = srcZ != null ? (Math.sign(p.z - srcZ) || 0) * power * 0.4 : 0;
        if (heavy) { p.vy = CONFIG.throwPop; p.onGround = false; }   // a little pop sells the knockdown
        p.anim = heavy ? "knockdown" : "hurt"; p.animStart = nowMs;
        state.flash = Math.max(state.flash, heavy ? 0.55 : 0.4); state.shake = Math.max(state.shake, heavy ? 13 : 9);
        state.hitStop = Math.max(state.hitStop, heavy ? 90 : CONFIG.hitStopMs);
        Sound.sfx.hurt(); updateHud();
        if (p.lives <= 0) { endGame(false); }
    }

    export function spawnDust(x: number, screenYy: number, n: number, color?: string): void {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 140;
            state.dust.push({ x, y: screenYy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0, max: 0.45 + Math.random() * 0.4, color: color || "#c9b8d6" });
        }
    }
    export function spawnPopup(x: number, screenYy: number, text: string): void { state.popups.push({ x, y: screenYy, text, life: 0, max: 0.8, vy: -60 }); }

    export function applyPickup(pk: Pickup): void {
        const p = state.player;
        if (pk.type === "heart") { p.lives = Math.min(CONFIG.maxLives, p.lives + 1); }
        else if (pk.type === "crossbow") { p.crossbowUntil = nowMs + CONFIG.crossbowMs; }
        else if (pk.type === "scythe") { p.scytheUntil = nowMs + CONFIG.scytheMs; }
        else if (pk.type === "holy") {
            state.flash = 0.7;
            for (const e of state.enemies) {
                if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < CONFIG.holyRadius) { e.alive = false; state.defeatedThisStage++; state.score += Math.round(e.def.points * 0.5); spawnDust(e.x, feetY(e.z, 0) - e.h * 0.5, 14, "#f4ecc6"); }
            }
        }
        Sound.sfx.pickup(); updateHud();
    }
}
