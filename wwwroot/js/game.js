"use strict";
/*
 * Stake Night — a canvas side-scrolling platformer for the Sunnydale guest portal.
 * TypeScript source. Compiled to wwwroot/js/game.js by `tsc` (see tsconfig.json), which runs
 * automatically during `dotnet build`. No runtime dependencies; the emitted JS is a plain
 * IIFE so it loads instantly inside the iOS captive WebKit view (ES2019 target downlevels
 * optional-chaining/nullish for older webviews).
 *
 * Buffy runs and jumps through an endless graveyard, staking vampires for score. Four enemy
 * types, three power-ups, and a mini-boss (The Master) at score milestones. Touch controls
 * plus keyboard. All art is procedurally drawn (no asset pipeline yet) so real sprites can
 * drop in later by swapping the draw* functions. Talks to /api/scores on game over.
 */
(function () {
    "use strict";
    // ---- Tunables ---------------------------------------------------------
    const CONFIG = {
        groundFrac: 0.82,
        camFollowFrac: 0.40, // Buffy sits this far from the left edge
        camLerp: 8, // camera smoothing (higher = snappier)
        gravity: 2400, // px/s^2
        moveAccel: 3000,
        moveMax: 320,
        friction: 2600,
        jumpVel: 820,
        coyoteMs: 90, // grace window to still jump after leaving ground
        jumpBufferMs: 120, // press-early grace before landing
        attackCooldownMs: 250,
        attackMs: 150,
        attackReach: 70, // forward reach from body center
        attackHalfH: 42,
        iframesMs: 1100, // invulnerability after a hit
        startLives: 3,
        maxLives: 5,
        baseKillPoints: 100,
        spawnStartMs: 1500,
        spawnMinMs: 520,
        spawnRampMs: 60000,
        maxEnemies: 36,
        cullDist: 1.6, // cull enemies beyond this * viewW from Buffy
        pickupEveryMs: 13000,
        crossbowMs: 8000,
        boltSpeed: 680,
        holyRadius: 260,
        bossFirstScore: 2500,
        bossScoreStep: 4000,
        bossSpeed: 110,
        bossDashSpeed: 460,
    };
    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    // Enemy archetypes. `weight(t)` returns spawn weight given elapsed-fraction t (0..1).
    const ENEMY_TYPES = {
        walker: { hp: 1, w: 26, h: 60, speed: 78, points: 100, color: "#1c1430", weight: () => 1.0 },
        runner: { hp: 1, w: 22, h: 54, speed: 168, points: 150, color: "#3a1330", weight: t => Math.max(0, t - 0.1) * 1.4 },
        brute: { hp: 3, w: 40, h: 74, speed: 52, points: 350, color: "#0f1a14", weight: t => Math.max(0, t - 0.25) * 0.9 },
        bat: { hp: 1, w: 30, h: 24, speed: 140, points: 200, color: "#241433", weight: t => Math.max(0, t - 0.15) * 0.8, flying: true },
        leaper: { hp: 1, w: 26, h: 54, speed: 96, points: 240, color: "#34102a", weight: t => Math.max(0, t - 0.2) * 0.8, leaps: true },
    };
    const LEAP_VY = -660; // leaper jump impulse (px/s)
    const SCYTHE_MS = 9000; // scythe power-up duration
    const SCYTHE_REACH_MULT = 1.9; // scythe widens the melee arc
    // ---- Canvas / DPR setup ----------------------------------------------
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");
    let viewW = 0, viewH = 0, dpr = 1;
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        viewW = canvas.clientWidth || window.innerWidth;
        viewH = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.round(viewW * dpr);
        canvas.height = Math.round(viewH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resize);
    function groundY() { return viewH * CONFIG.groundFrac; }
    // ---- Audio (Web Audio, fully synthesized — no asset files, no CDN) --------------------
    // Everything is gesture-gated (the AudioContext is created on the first tap/click) and
    // degrades to silence where a captive webview blocks audio: if there's no AudioContext
    // constructor, every call is a no-op. Mute state persists in localStorage.
    const Sound = (function () {
        const ACtor = window.AudioContext
            || window.webkitAudioContext;
        let ctx = null;
        let master = null;
        let muted = readMuted();
        let musicId = 0;
        let musicStep = 0;
        function readMuted() { try {
            return localStorage.getItem("sn-muted") === "1";
        }
        catch {
            return false;
        } }
        function writeMuted(v) { try {
            localStorage.setItem("sn-muted", v ? "1" : "0");
        }
        catch { /* no storage */ } }
        function ensure() {
            if (ctx || !ACtor) {
                return;
            }
            try {
                ctx = new ACtor();
                master = ctx.createGain();
                master.gain.value = muted ? 0 : 0.5;
                master.connect(ctx.destination);
            }
            catch {
                ctx = null;
                master = null;
            }
        }
        function resume() {
            ensure();
            if (ctx && ctx.state === "suspended") {
                ctx.resume().catch(() => { });
            }
        }
        // A pitched tone with an exponential decay envelope.
        function blip(f0, f1, dur, type, vol) {
            if (!ctx || !master || muted) {
                return;
            }
            const t = ctx.currentTime;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(f0, t);
            o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g);
            g.connect(master);
            o.start(t);
            o.stop(t + dur + 0.02);
        }
        // A short filtered noise burst — percussive "thwack"/dust.
        function burst(dur, vol) {
            if (!ctx || !master || muted) {
                return;
            }
            const t = ctx.currentTime;
            const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
            const buf = ctx.createBuffer(1, n, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < n; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / n);
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            const hp = ctx.createBiquadFilter();
            hp.type = "highpass";
            hp.frequency.value = 700;
            src.connect(hp);
            hp.connect(g);
            g.connect(master);
            src.start(t);
            src.stop(t + dur + 0.02);
        }
        const sfx = {
            stake() { burst(0.09, 0.5); blip(420, 90, 0.10, "square", 0.18); },
            whiff() { blip(300, 150, 0.08, "sine", 0.12); },
            hurt() { blip(220, 55, 0.30, "sawtooth", 0.35); },
            pickup() { blip(520, 990, 0.14, "triangle", 0.30); },
            jump() { blip(300, 620, 0.10, "square", 0.16); },
            shoot() { blip(900, 300, 0.08, "square", 0.18); },
            bossIn() { blip(120, 55, 0.70, "sawtooth", 0.40); },
            bossDown() { burst(0.5, 0.5); blip(220, 40, 0.60, "sawtooth", 0.40); },
            over() { blip(440, 90, 0.60, "triangle", 0.30); },
            ui() { blip(620, 620, 0.05, "square", 0.12); },
        };
        // Subtle looping minor-key bassline. Timer-driven; respects mute and missing audio.
        const BASS = [110.00, 110.00, 130.81, 146.83, 110.00, 98.00, 130.81, 164.81];
        function startMusic() {
            if (!ctx || musicId) {
                return;
            }
            musicStep = 0;
            musicId = setInterval(function () {
                if (!ctx || muted) {
                    return;
                }
                const f = BASS[musicStep % BASS.length];
                musicStep++;
                blip(f, f, 0.22, "triangle", 0.06);
                if (musicStep % 4 === 0) {
                    blip(f * 2, f * 2, 0.10, "sine", 0.025);
                }
            }, 300);
        }
        function stopMusic() { if (musicId) {
            clearInterval(musicId);
            musicId = 0;
        } }
        function toggleMute() {
            muted = !muted;
            writeMuted(muted);
            if (master) {
                master.gain.value = muted ? 0 : 0.5;
            }
            return muted;
        }
        function isMuted() { return muted; }
        return { resume, sfx, startMusic, stopMusic, toggleMute, isMuted };
    })();
    // ---- Clock (single source of truth for cooldowns/buffers) -------------
    let nowMs = 0;
    // ---- Input ------------------------------------------------------------
    const input = { left: false, right: false, jumpBufferedAt: -1e9 };
    const heldKeys = new Set();
    function pressJump() { input.jumpBufferedAt = nowMs; }
    function keyDown(e) {
        const k = e.key.toLowerCase();
        if (["arrowleft", "a"].includes(k)) {
            input.left = true;
            heldKeys.add(k);
            e.preventDefault();
        }
        else if (["arrowright", "d"].includes(k)) {
            input.right = true;
            heldKeys.add(k);
            e.preventDefault();
        }
        else if (["arrowup", "w", " ", "spacebar"].includes(k) || e.code === "Space") {
            pressJump();
            e.preventDefault();
        }
        else if (["j", "f", "x", "enter"].includes(k)) {
            tryAttack();
            e.preventDefault();
        }
    }
    function keyUp(e) {
        const k = e.key.toLowerCase();
        if (["arrowleft", "a"].includes(k)) {
            heldKeys.delete(k);
            input.left = heldKeys.has("arrowleft") || heldKeys.has("a");
        }
        else if (["arrowright", "d"].includes(k)) {
            heldKeys.delete(k);
            input.right = heldKeys.has("arrowright") || heldKeys.has("d");
        }
    }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    // Tapping the canvas itself also stakes (handy on desktop).
    canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); tryAttack(); }, { passive: false });
    // On-screen touch buttons. Held buttons (left/right) track via pointer capture.
    function bindHold(el, on) {
        if (!el) {
            return;
        }
        const set = (v) => () => { on(v); };
        el.addEventListener("pointerdown", (e) => { var _a; e.preventDefault(); (_a = el.setPointerCapture) === null || _a === void 0 ? void 0 : _a.call(el, e.pointerId); on(true); }, { passive: false });
        el.addEventListener("pointerup", (e) => { e.preventDefault(); on(false); }, { passive: false });
        el.addEventListener("pointercancel", set(false));
        el.addEventListener("pointerleave", set(false));
    }
    function bindTap(el, fn) {
        if (!el) {
            return;
        }
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); }, { passive: false });
    }
    bindHold(document.getElementById("btn-left"), v => { input.left = v; });
    bindHold(document.getElementById("btn-right"), v => { input.right = v; });
    bindTap(document.getElementById("btn-jump"), pressJump);
    bindTap(document.getElementById("btn-stake"), tryAttack);
    // ---- Game state -------------------------------------------------------
    let state;
    let projHitId = -1; // unique per-bolt hit marker, kept separate from melee attackId
    function freshPlayer() {
        return {
            x: 0, y: groundY(), // y = feet (bottom of sprite)
            vx: 0, vy: 0,
            w: 28, h: 64,
            facing: 1,
            onGround: true,
            lastGroundMs: 0,
            attackUntil: -1e9,
            lastAttackMs: -1e9,
            hurtUntil: -1e9,
            crossbowUntil: -1e9,
            scytheUntil: -1e9,
            lives: CONFIG.startLives,
        };
    }
    function freshState() {
        return {
            running: false,
            score: 0,
            combo: 0,
            bestCombo: 0,
            elapsed: 0,
            spawnTimer: 700,
            pickupTimer: CONFIG.pickupEveryMs,
            camX: 0,
            attackId: 0,
            flash: 0, // white-flash alpha for holy water / boss death
            nextBossScore: CONFIG.bossFirstScore,
            bossLevel: 0,
            player: freshPlayer(),
            enemies: [],
            pickups: [],
            bolts: [],
            dust: [],
            stars: [],
            graves: [],
            platforms: [],
            platCursorR: 0,
            platCursorL: 0,
            boss: null,
            popups: [],
            banner: null,
            shake: 0,
            runToken: null,
        };
    }
    // ---- Background -------------------------------------------------------
    function seedBackground() {
        state.stars = [];
        const count = Math.round((viewW * viewH) / 12000);
        for (let i = 0; i < count; i++) {
            state.stars.push({
                x: Math.random() * viewW, y: Math.random() * groundY() * 0.9,
                r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2, par: 0.2 + Math.random() * 0.2,
            });
        }
        state.graves = [];
        const graveCount = Math.max(6, Math.round(viewW / 120));
        for (let i = 0; i < graveCount * 3; i++) {
            state.graves.push({ x: (i - graveCount) * 140 + Math.random() * 80, w: 26 + Math.random() * 22, h: 34 + Math.random() * 30, par: 0.55 });
        }
    }
    // ---- Platforms (one-way crypt ledges) --------------------------------
    function platGap() { return 240 + Math.random() * 220; }
    function makePlatform(x) {
        const top = groundY() - (96 + Math.random() * 96);
        return { x, y: top, w: 80 + Math.random() * 90 };
    }
    function ensurePlatforms() {
        const right = state.camX + viewW + 600;
        const left = state.camX - 600;
        while (state.platCursorR < right) {
            state.platforms.push(makePlatform(state.platCursorR));
            state.platCursorR += platGap();
        }
        while (state.platCursorL > left) {
            state.platCursorL -= platGap();
            state.platforms.push(makePlatform(state.platCursorL));
        }
        const lo = state.camX - 1400, hi = state.camX + viewW + 1400;
        state.platforms = state.platforms.filter(p => p.x + p.w > lo && p.x < hi);
    }
    // ---- Spawning ---------------------------------------------------------
    function difficultyT() { return Math.min(1, state.elapsed / CONFIG.spawnRampMs); }
    function pickEnemyType() {
        const t = difficultyT();
        const entries = Object.entries(ENEMY_TYPES).map(([k, v]) => [k, Math.max(0, v.weight(t))]);
        const total = entries.reduce((s, [, w]) => s + w, 0);
        let r = Math.random() * total;
        for (const [k, w] of entries) {
            if ((r -= w) <= 0) {
                return k;
            }
        }
        return "walker";
    }
    function spawnEnemy() {
        if (state.enemies.length >= CONFIG.maxEnemies) {
            return;
        }
        const typeKey = pickEnemyType();
        const def = ENEMY_TYPES[typeKey];
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side > 0 ? state.camX + viewW + 50 : state.camX - 50;
        const feetY = def.flying ? groundY() - (120 + Math.random() * 150) : groundY();
        state.enemies.push({
            type: typeKey, x, y: feetY, baseY: feetY,
            w: def.w, h: def.h, hp: def.hp, def,
            wobble: Math.random() * Math.PI * 2,
            contactUntil: -1e9, hitBy: -1, alive: true,
            vy: 0, nextLeapAt: nowMs + 600 + Math.random() * 600,
        });
    }
    function spawnPickup() {
        const roll = Math.random();
        const type = roll < 0.16 ? "heart"
            : roll < 0.46 ? "crossbow"
                : roll < 0.73 ? "scythe"
                    : "holy";
        // Drop it ahead of Buffy, sometimes on a platform.
        const ahead = state.player.facing * (220 + Math.random() * 260);
        const x = state.player.x + ahead;
        let y = groundY() - 30;
        const overlap = state.platforms.find(p => x > p.x && x < p.x + p.w && p.y < groundY() - 50);
        if (overlap && Math.random() < 0.5) {
            y = overlap.y - 26;
        }
        state.pickups.push({ type, x, y, bob: Math.random() * Math.PI * 2, born: nowMs });
    }
    // ---- Boss -------------------------------------------------------------
    function spawnBoss() {
        state.bossLevel++;
        const hp = 14 + state.bossLevel * 8;
        state.boss = {
            x: state.camX + viewW + 80, y: groundY(),
            w: 56, h: 96, hp, maxHp: hp,
            nextDashAt: nowMs + 1800, dashUntil: -1e9, vx: 0,
            contactUntil: -1e9, hitBy: -1,
        };
        state.banner = { text: "The Master approaches", until: nowMs + 2400 };
        state.shake = Math.max(state.shake, 8);
        Sound.sfx.bossIn();
    }
    // ---- Attacks / combat -------------------------------------------------
    function tryAttack() {
        if (!state || !state.running) {
            return;
        }
        const p = state.player;
        if (nowMs - p.lastAttackMs < CONFIG.attackCooldownMs) {
            return;
        }
        p.lastAttackMs = nowMs;
        p.attackUntil = nowMs + CONFIG.attackMs;
        state.attackId++;
        if (nowMs < p.crossbowUntil) {
            // Crossbow active: fire a bolt instead of swinging.
            state.bolts.push({ x: p.x + p.facing * 18, y: p.y - p.h * 0.55, vx: p.facing * CONFIG.boltSpeed, alive: true });
            Sound.sfx.shoot();
            return;
        }
        // Melee arc in front of Buffy. The Scythe widens the reach and one-shots anything.
        const scythe = nowMs < p.scytheUntil;
        const reach = scythe ? CONFIG.attackReach * SCYTHE_REACH_MULT : CONFIG.attackReach;
        const cx = p.x + p.facing * (reach * 0.5 + p.w * 0.5);
        const top = p.y - p.h, bottom = p.y;
        let hitAny = false;
        for (const e of state.enemies) {
            if (!e.alive || e.hitBy === state.attackId) {
                continue;
            }
            const inX = Math.abs(e.x - cx) < reach * 0.5 + e.w * 0.5;
            const inY = e.y > top - CONFIG.attackHalfH && e.y - e.h < bottom + 10;
            const facingOk = (e.x - p.x) * p.facing > -8;
            if (inX && inY && facingOk) {
                hitEnemy(e, state.attackId, scythe);
                hitAny = true;
            }
        }
        // Boss takes melee too (the Scythe bites harder).
        if (state.boss) {
            const b = state.boss;
            const inX = Math.abs(b.x - cx) < reach * 0.5 + b.w * 0.5;
            const facingOk = (b.x - p.x) * p.facing > -8;
            if (inX && facingOk && b.hitBy !== state.attackId) {
                b.hitBy = state.attackId;
                damageBoss(scythe ? 3 : 1);
                hitAny = true;
            }
        }
        if (!hitAny) {
            state.combo = 0;
            Sound.sfx.whiff();
            updateHud();
        } // whiff drops the combo
    }
    function hitEnemy(e, attackId, lethal = false) {
        e.hitBy = attackId;
        Sound.sfx.stake();
        if (lethal) {
            e.hp = 1;
        } // Scythe one-shots even multi-hit brutes
        e.hp--;
        if (e.hp > 0) {
            spawnDust(e.x, e.y - e.h * 0.5, 6, "#8a6a9a");
            return;
        }
        e.alive = false;
        state.combo++;
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        const mult = 1 + Math.floor(state.combo / 5) * 0.5;
        const gained = Math.round(e.def.points * mult);
        state.score += gained;
        spawnDust(e.x, e.y - e.h * 0.5, 16, "#c9b8d6");
        spawnPopup(e.x, e.y - e.h, "+" + gained);
        updateHud();
    }
    function spawnPopup(x, y, text) {
        state.popups.push({ x, y, text, life: 0, max: 0.8, vy: -60 });
    }
    function damageBoss(n) {
        const b = state.boss;
        if (!b) {
            return;
        }
        b.hp -= n;
        spawnDust(b.x, b.y - b.h * 0.5, 8, "#ff7b7b");
        if (b.hp <= 0) {
            state.score += 1000 * state.bossLevel;
            state.combo += 5;
            spawnDust(b.x, b.y - b.h * 0.5, 40, "#f4ecc6");
            spawnPopup(b.x, b.y - b.h, "+" + (1000 * state.bossLevel));
            state.flash = 0.8;
            state.shake = Math.max(state.shake, 16);
            state.banner = { text: "The Master falls", until: nowMs + 2000 };
            Sound.sfx.bossDown();
            state.boss = null;
            state.nextBossScore = state.score + CONFIG.bossScoreStep;
        }
        updateHud();
    }
    function hurtPlayer() {
        const p = state.player;
        if (nowMs < p.hurtUntil) {
            return;
        }
        p.hurtUntil = nowMs + CONFIG.iframesMs;
        p.lives--;
        state.combo = 0;
        state.flash = Math.max(state.flash, 0.4);
        state.shake = Math.max(state.shake, 7);
        Sound.sfx.hurt();
        updateHud();
        if (p.lives <= 0) {
            endGame();
        }
    }
    function spawnDust(x, y, n, color) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 30 + Math.random() * 140;
            state.dust.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0, max: 0.45 + Math.random() * 0.4, color: color || "#c9b8d6" });
        }
    }
    // ---- Pickups effects --------------------------------------------------
    function applyPickup(pk) {
        const p = state.player;
        if (pk.type === "heart") {
            p.lives = Math.min(CONFIG.maxLives, p.lives + 1);
        }
        else if (pk.type === "crossbow") {
            p.crossbowUntil = nowMs + CONFIG.crossbowMs;
        }
        else if (pk.type === "scythe") {
            p.scytheUntil = nowMs + SCYTHE_MS;
        }
        else if (pk.type === "holy") {
            state.flash = 0.7;
            for (const e of state.enemies) {
                if (e.alive && Math.hypot(e.x - p.x, (e.y - e.h * 0.5) - (p.y - p.h * 0.5)) < CONFIG.holyRadius) {
                    e.alive = false;
                    state.score += Math.round(e.def.points * 0.5);
                    spawnDust(e.x, e.y - e.h * 0.5, 14, "#f4ecc6");
                }
            }
        }
        Sound.sfx.pickup();
        updateHud();
    }
    // ---- Update -----------------------------------------------------------
    function update(dt) {
        state.elapsed += dt * 1000;
        const p = state.player;
        // --- Horizontal movement ---
        const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (dir !== 0) {
            p.vx += dir * CONFIG.moveAccel * dt;
            p.facing = dir;
        }
        else {
            const f = CONFIG.friction * dt;
            p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
        }
        p.vx = Math.max(-CONFIG.moveMax, Math.min(CONFIG.moveMax, p.vx));
        p.x += p.vx * dt;
        // --- Jump (with coyote + buffer) ---
        const canCoyote = p.onGround || (nowMs - p.lastGroundMs) < CONFIG.coyoteMs;
        if (nowMs - input.jumpBufferedAt < CONFIG.jumpBufferMs && canCoyote) {
            p.vy = -CONFIG.jumpVel;
            p.onGround = false;
            input.jumpBufferedAt = -1e9;
            p.lastGroundMs = -1e9;
            Sound.sfx.jump();
        }
        // --- Gravity + vertical collision ---
        const prevFeet = p.y;
        p.vy += CONFIG.gravity * dt;
        p.y += p.vy * dt;
        p.onGround = false;
        // One-way platforms: land only when falling through the top.
        if (p.vy >= 0) {
            for (const plat of state.platforms) {
                const overX = p.x + p.w * 0.5 > plat.x && p.x - p.w * 0.5 < plat.x + plat.w;
                if (overX && prevFeet <= plat.y + 2 && p.y >= plat.y) {
                    p.y = plat.y;
                    p.vy = 0;
                    p.onGround = true;
                    break;
                }
            }
        }
        // Solid ground floor.
        if (p.y >= groundY()) {
            p.y = groundY();
            p.vy = 0;
            p.onGround = true;
        }
        if (p.onGround) {
            p.lastGroundMs = nowMs;
        }
        // --- Camera follow ---
        const targetCam = p.x - viewW * CONFIG.camFollowFrac;
        state.camX += (targetCam - state.camX) * Math.min(1, CONFIG.camLerp * dt);
        ensurePlatforms();
        // --- Spawning ---
        if (!state.boss) {
            state.spawnTimer -= dt * 1000;
            if (state.spawnTimer <= 0) {
                spawnEnemy();
                const interval = CONFIG.spawnStartMs + (CONFIG.spawnMinMs - CONFIG.spawnStartMs) * difficultyT();
                state.spawnTimer = interval;
            }
        }
        state.pickupTimer -= dt * 1000;
        if (state.pickupTimer <= 0) {
            spawnPickup();
            state.pickupTimer = CONFIG.pickupEveryMs;
        }
        if (!state.boss && state.score >= state.nextBossScore) {
            spawnBoss();
        }
        // --- Enemies ---
        const cullLo = p.x - viewW * CONFIG.cullDist, cullHi = p.x + viewW * CONFIG.cullDist;
        for (const e of state.enemies) {
            if (!e.alive) {
                continue;
            }
            const toward = Math.sign(p.x - e.x) || 1;
            e.x += toward * e.def.speed * dt;
            e.wobble += dt * 6;
            if (e.def.flying) {
                e.y = e.baseY + Math.sin(e.wobble) * 22;
            }
            else if (e.def.leaps) {
                // Arc-leap: spring off the ground periodically, fall under gravity.
                e.vy += CONFIG.gravity * dt;
                e.y += e.vy * dt;
                if (e.y >= groundY()) {
                    e.y = groundY();
                    e.vy = 0;
                    if (nowMs >= e.nextLeapAt) {
                        e.vy = LEAP_VY;
                        e.nextLeapAt = nowMs + 1400 + Math.random() * 1000;
                    }
                }
            }
            // Contact damage.
            if (overlapsPlayer(e) && nowMs > e.contactUntil) {
                e.contactUntil = nowMs + 600;
                hurtPlayer();
            }
        }
        state.enemies = state.enemies.filter(e => e.alive && e.x > cullLo && e.x < cullHi);
        // --- Boss ---
        if (state.boss) {
            updateBoss(dt);
        }
        // --- Bolts ---
        for (const b of state.bolts) {
            b.x += b.vx * dt;
            for (const e of state.enemies) {
                if (e.alive && Math.abs(e.x - b.x) < e.w * 0.6 && Math.abs((e.y - e.h * 0.5) - b.y) < e.h * 0.6) {
                    hitEnemy(e, projHitId--);
                    b.alive = false;
                    break;
                }
            }
            if (b.alive && state.boss && Math.abs(state.boss.x - b.x) < state.boss.w * 0.6) {
                damageBoss(1);
                b.alive = false;
            }
            if (Math.abs(b.x - p.x) > viewW) {
                b.alive = false;
            }
        }
        state.bolts = state.bolts.filter(b => b.alive);
        // --- Pickups ---
        for (const pk of state.pickups) {
            pk.bob += dt * 4;
            if (Math.abs(pk.x - p.x) < 26 && Math.abs(pk.y - (p.y - p.h * 0.5)) < 44) {
                pk.taken = true;
                applyPickup(pk);
            }
        }
        state.pickups = state.pickups.filter(pk => !pk.taken && Math.abs(pk.x - p.x) < viewW * 1.2 && nowMs - pk.born < 20000);
        // --- Particles + popups + flash + shake ---
        for (const d of state.dust) {
            d.life += dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.vy += 220 * dt;
        }
        state.dust = state.dust.filter(d => d.life < d.max);
        for (const pop of state.popups) {
            pop.life += dt;
            pop.y += pop.vy * dt;
            pop.vy += 40 * dt;
        }
        state.popups = state.popups.filter(pop => pop.life < pop.max);
        if (state.flash > 0) {
            state.flash = Math.max(0, state.flash - dt * 2);
        }
        if (state.shake > 0) {
            state.shake = Math.max(0, state.shake - dt * 40);
        }
        if (state.banner && nowMs > state.banner.until) {
            state.banner = null;
        }
        // Keep the HUD power timer ticking while any temporary power is active.
        const powerActive = nowMs < p.crossbowUntil || nowMs < p.scytheUntil;
        if (powerActive) {
            p._wasCross = true;
            updateHud();
        }
        else if (p._wasCross) {
            p._wasCross = false;
            updateHud();
        }
    }
    function overlapsPlayer(e) {
        const p = state.player;
        return Math.abs(e.x - p.x) < (e.w + p.w) * 0.5 && Math.abs((e.y - e.h * 0.5) - (p.y - p.h * 0.5)) < (e.h + p.h) * 0.5;
    }
    function updateBoss(dt) {
        var _a;
        const b = state.boss;
        if (!b) {
            return;
        }
        const p = state.player;
        const toward = Math.sign(p.x - b.x) || 1;
        if (nowMs < b.dashUntil) {
            b.x += ((_a = b.dashVx) !== null && _a !== void 0 ? _a : 0) * dt;
        }
        else {
            b.x += toward * CONFIG.bossSpeed * dt;
            if (nowMs >= b.nextDashAt) {
                b.dashUntil = nowMs + 380;
                b.dashVx = toward * CONFIG.bossDashSpeed;
                b.nextDashAt = nowMs + 2200;
            }
        }
        if (Math.abs(b.x - p.x) < (b.w + p.w) * 0.5 && nowMs > b.contactUntil) {
            b.contactUntil = nowMs + 700;
            hurtPlayer();
        }
    }
    // ---- Render -----------------------------------------------------------
    function render() {
        const gy = groundY();
        // Screen shake: translate the whole world by a jitter; background is overscanned by OS
        // so the shifted edges never reveal a gap.
        const OS = 26;
        const sx = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
        const sy = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
        ctx.save();
        ctx.translate(sx, sy);
        // Sky.
        const sky = ctx.createLinearGradient(0, 0, 0, gy);
        sky.addColorStop(0, "#0b0a14");
        sky.addColorStop(1, "#241a30");
        ctx.fillStyle = sky;
        ctx.fillRect(-OS, -OS, viewW + OS * 2, gy + OS);
        // Stars (subtle parallax).
        for (const s of state.stars) {
            const sx = (s.x - state.camX * s.par) % viewW;
            const x = sx < 0 ? sx + viewW : sx;
            ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw + nowMs / 600));
            ctx.fillStyle = "#fdf6d8";
            ctx.beginPath();
            ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Moon (fixed-ish).
        ctx.fillStyle = "#f4ecc6";
        ctx.beginPath();
        ctx.arc(viewW * 0.8, gy * 0.26, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(11,10,20,0.55)";
        ctx.beginPath();
        ctx.arc(viewW * 0.8 + 12, gy * 0.26 - 6, 30, 0, Math.PI * 2);
        ctx.fill();
        // Gravestone silhouettes (parallax).
        ctx.fillStyle = "#161020";
        for (const g of state.graves) {
            const x = g.x - state.camX * g.par;
            const sx = ((x % (viewW + 400)) + (viewW + 400)) % (viewW + 400) - 200;
            ctx.beginPath();
            ctx.moveTo(sx - g.w / 2, gy);
            ctx.lineTo(sx - g.w / 2, gy - g.h * 0.55);
            ctx.arc(sx, gy - g.h * 0.55, g.w / 2, Math.PI, 0);
            ctx.lineTo(sx + g.w / 2, gy);
            ctx.closePath();
            ctx.fill();
        }
        // Ground.
        const ground = ctx.createLinearGradient(0, gy, 0, viewH);
        ground.addColorStop(0, "#27331f");
        ground.addColorStop(1, "#121a0e");
        ctx.fillStyle = ground;
        ctx.fillRect(-OS, gy, viewW + OS * 2, viewH - gy + OS);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(viewW, gy);
        ctx.stroke();
        // Platforms (crypt ledges).
        for (const plat of state.platforms) {
            const x = plat.x - state.camX;
            if (x + plat.w < -40 || x > viewW + 40) {
                continue;
            }
            ctx.fillStyle = "#3a2f26";
            ctx.fillRect(x, plat.y, plat.w, 14);
            ctx.fillStyle = "#52443a";
            ctx.fillRect(x, plat.y, plat.w, 4);
            ctx.fillStyle = "#241c16";
            ctx.fillRect(x + 4, plat.y + 14, plat.w - 8, 10);
        }
        // Pickups.
        for (const pk of state.pickups) {
            drawPickup(pk);
        }
        // Bolts.
        ctx.fillStyle = "#e8c659";
        for (const b of state.bolts) {
            const x = b.x - state.camX;
            ctx.fillRect(x - 8, b.y - 1.5, 16, 3);
        }
        // Enemies.
        for (const e of state.enemies) {
            if (e.alive) {
                drawEnemy(e);
            }
        }
        // Boss.
        if (state.boss) {
            drawBoss(state.boss);
        }
        // Player.
        drawBuffy();
        // Dust.
        for (const d of state.dust) {
            const k = 1 - d.life / d.max;
            ctx.globalAlpha = Math.max(0, k);
            ctx.fillStyle = d.color;
            ctx.beginPath();
            ctx.arc(d.x - state.camX, d.y, 2 + k * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Floating score popups.
        ctx.font = "bold 16px Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const pop of state.popups) {
            const k = 1 - pop.life / pop.max;
            ctx.globalAlpha = Math.max(0, k);
            ctx.fillStyle = "#f4ecc6";
            ctx.fillText(pop.text, pop.x - state.camX, pop.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore(); // end shake transform — overlays below are steady on screen
        // Hit / event flash.
        if (state.flash > 0) {
            ctx.fillStyle = `rgba(255,240,220,${state.flash * 0.5})`;
            ctx.fillRect(0, 0, viewW, viewH);
        }
        // Event banner (boss in/out).
        if (state.banner) {
            const remain = state.banner.until - nowMs;
            ctx.globalAlpha = Math.min(1, remain / 500); // fade out in the last 500ms
            ctx.fillStyle = "#ff5b5b";
            ctx.font = "italic bold 26px Georgia, serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(state.banner.text, viewW / 2, viewH * 0.3);
            ctx.globalAlpha = 1;
        }
    }
    function drawBuffy() {
        const p = state.player;
        const x = p.x - state.camX, y = p.y;
        const lunging = nowMs < p.attackUntil;
        const hurtBlink = nowMs < p.hurtUntil && (Math.floor(nowMs / 80) % 2 === 0);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(p.facing, 1);
        if (hurtBlink) {
            ctx.globalAlpha = 0.4;
        }
        // Legs / coat / head
        ctx.fillStyle = "#27313f";
        ctx.fillRect(-9, -22, 18, 22);
        ctx.fillStyle = "#7a2233";
        ctx.fillRect(-9, -54, 18, 34);
        ctx.fillStyle = "#f0c9a0";
        ctx.beginPath();
        ctx.arc(0, -62, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8c659";
        ctx.beginPath();
        ctx.arc(0, -64, 9.5, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-9.5, -64, 4, 12);
        ctx.fillRect(5.5, -64, 4, 12);
        // Arm + stake (or crossbow)
        const reach = lunging ? 30 : 20;
        ctx.strokeStyle = "#f0c9a0";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(6, -46);
        ctx.lineTo(reach, -44);
        ctx.stroke();
        if (nowMs < p.crossbowUntil) {
            ctx.strokeStyle = "#5a4632";
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(reach, -48);
            ctx.lineTo(reach + 4, -40);
            ctx.stroke();
        }
        else if (nowMs < p.scytheUntil) {
            // Scythe: a long shaft with an angled blade tip.
            const bl = reach + (lunging ? 32 : 26);
            ctx.strokeStyle = "#6a5238";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(reach, -44);
            ctx.lineTo(bl, -44);
            ctx.stroke();
            ctx.strokeStyle = "#c7ccd2";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(bl, -44);
            ctx.quadraticCurveTo(bl + 6, -58, bl - 8, -60);
            ctx.stroke();
        }
        else {
            ctx.strokeStyle = "#8a5a2b";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(reach, -44);
            ctx.lineTo(reach + (lunging ? 16 : 14), -44);
            ctx.stroke();
        }
        ctx.restore();
    }
    function drawEnemy(e) {
        const x = e.x - state.camX, y = e.y;
        const bob = Math.sin(e.wobble) * (e.def.flying ? 0 : 3);
        ctx.save();
        ctx.translate(x, y + bob);
        if (e.def.flying) {
            // Bat.
            ctx.fillStyle = e.def.color;
            ctx.beginPath();
            ctx.arc(0, -e.h * 0.5, e.h * 0.45, 0, Math.PI * 2);
            ctx.fill();
            const wing = Math.sin(nowMs / 60) * 6;
            ctx.beginPath();
            ctx.moveTo(0, -e.h * 0.5);
            ctx.lineTo(-e.w * 0.7, -e.h * 0.5 - wing);
            ctx.lineTo(-e.w * 0.3, -e.h * 0.3);
            ctx.moveTo(0, -e.h * 0.5);
            ctx.lineTo(e.w * 0.7, -e.h * 0.5 - wing);
            ctx.lineTo(e.w * 0.3, -e.h * 0.3);
            ctx.fill();
            ctx.fillStyle = "#ff3b3b";
            ctx.fillRect(-4, -e.h * 0.55, 2.5, 2.5);
            ctx.fillRect(2, -e.h * 0.55, 2.5, 2.5);
        }
        else {
            ctx.fillStyle = "#0f0a1c";
            ctx.fillRect(-e.w / 2, -22, e.w, 22);
            ctx.fillStyle = e.def.color;
            ctx.fillRect(-e.w / 2, -e.h + 10, e.w, e.h - 32);
            ctx.fillStyle = "#b9a6c4";
            ctx.beginPath();
            ctx.arc(0, -e.h + 8, e.w * 0.34, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ff3b3b";
            ctx.fillRect(-5, -e.h + 6, 3, 3);
            ctx.fillRect(2, -e.h + 6, 3, 3);
            if (e.type === "brute" && e.hp < e.def.hp) {
                ctx.fillStyle = "#7a2233";
                ctx.fillRect(-e.w / 2, -e.h + 4, e.w * (e.hp / e.def.hp), 3);
            }
        }
        ctx.restore();
    }
    function drawBoss(b) {
        const x = b.x - state.camX, y = b.y;
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = "#0a0610";
        ctx.fillRect(-b.w / 2, -b.h, b.w, b.h);
        ctx.fillStyle = "#2a1030";
        ctx.fillRect(-b.w / 2 + 4, -b.h + 6, b.w - 8, b.h - 30);
        ctx.fillStyle = "#cdbcd6";
        ctx.beginPath();
        ctx.arc(0, -b.h + 14, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff2020";
        ctx.fillRect(-8, -b.h + 10, 5, 5);
        ctx.fillRect(3, -b.h + 10, 5, 5);
        ctx.restore();
    }
    function drawPickup(pk) {
        const x = pk.x - state.camX, y = pk.y + Math.sin(pk.bob) * 4;
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = "rgba(232,198,89,0.18)";
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        if (pk.type === "heart") {
            ctx.fillStyle = "#c83b54";
            ctx.font = "20px serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("❤", 0, 1);
        }
        else if (pk.type === "crossbow") {
            ctx.strokeStyle = "#e8c659";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-8, -6);
            ctx.lineTo(8, -6);
            ctx.moveTo(0, -8);
            ctx.lineTo(0, 8);
            ctx.stroke();
        }
        else if (pk.type === "scythe") {
            ctx.strokeStyle = "#6a5238";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-2, 9);
            ctx.lineTo(2, -9);
            ctx.stroke();
            ctx.strokeStyle = "#c7ccd2";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(2, -9);
            ctx.quadraticCurveTo(-9, -9, -8, 0);
            ctx.stroke();
        }
        else {
            ctx.fillStyle = "#bfe3ff";
            ctx.fillRect(-5, -8, 10, 14);
            ctx.fillStyle = "#fff";
            ctx.fillRect(-3, -11, 6, 4);
        }
        ctx.restore();
    }
    // ---- HUD --------------------------------------------------------------
    const hud = document.getElementById("hud");
    const hudScore = document.getElementById("hud-score");
    const hudCombo = document.getElementById("hud-combo");
    const hudLives = document.getElementById("hud-lives");
    const hudPower = document.getElementById("hud-power");
    const bossBar = document.getElementById("boss-bar");
    const bossFill = document.getElementById("boss-hp-fill");
    function updateHud() {
        hudScore.textContent = state.score.toLocaleString();
        hudCombo.textContent = state.combo >= 2 ? ("x" + state.combo) : "";
        hudLives.textContent = "❤".repeat(Math.max(0, state.player.lives)) || "—";
        if (hudPower) {
            const parts = [];
            const cb = state.player.crossbowUntil - nowMs;
            if (cb > 0) {
                parts.push("🏹 " + Math.ceil(cb / 1000));
            }
            const sc = state.player.scytheUntil - nowMs;
            if (sc > 0) {
                parts.push("⚔ " + Math.ceil(sc / 1000));
            }
            hudPower.textContent = parts.join("  ");
        }
        if (bossBar) {
            if (state.boss) {
                bossBar.classList.remove("hidden");
                bossFill.style.width = Math.max(0, (state.boss.hp / state.boss.maxHp) * 100) + "%";
            }
            else {
                bossBar.classList.add("hidden");
            }
        }
    }
    // ---- Loop -------------------------------------------------------------
    let rafId = 0, lastTs = 0;
    function frame(ts) {
        if (!state.running) {
            return;
        }
        if (!lastTs) {
            lastTs = ts;
        }
        nowMs = ts;
        let dt = (ts - lastTs) / 1000;
        lastTs = ts;
        if (dt > 0.05) {
            dt = 0.05;
        }
        update(dt);
        if (state.running) {
            render();
            rafId = requestAnimationFrame(frame);
        }
    }
    // ---- Lifecycle --------------------------------------------------------
    const overlayStart = document.getElementById("overlay-start");
    const overlayOver = document.getElementById("overlay-over");
    const controls = document.getElementById("controls");
    // Ask the server for a signed run token. Sent back on score submit so the board can trust it.
    function requestRunToken() {
        fetch("/api/run/start", { method: "POST" })
            .then(r => r.ok ? r.json() : null)
            .then((d) => { if (d && d.token && state) {
            state.runToken = d.token;
        } })
            .catch(() => { });
    }
    function startGame() {
        resize();
        Sound.resume();
        Sound.startMusic();
        state = freshState();
        requestRunToken();
        state.camX = state.player.x - viewW * CONFIG.camFollowFrac;
        state.platCursorR = state.camX - 300;
        state.platCursorL = state.camX - 300;
        seedBackground();
        ensurePlatforms();
        state.running = true;
        lastTs = 0;
        input.left = input.right = false;
        input.jumpBufferedAt = -1e9;
        overlayStart.classList.add("hidden");
        overlayOver.classList.add("hidden");
        if (controls) {
            controls.classList.remove("hidden");
            controls.setAttribute("aria-hidden", "false");
        }
        hud.setAttribute("aria-hidden", "false");
        updateHud();
        rafId = requestAnimationFrame(frame);
    }
    function endGame() {
        state.running = false;
        cancelAnimationFrame(rafId);
        Sound.stopMusic();
        Sound.sfx.over();
        render();
        if (controls) {
            controls.classList.add("hidden");
            controls.setAttribute("aria-hidden", "true");
        }
        if (bossBar) {
            bossBar.classList.add("hidden");
        }
        showGameOver();
    }
    // ---- Game over: initials + leaderboard --------------------------------
    // Arcade-style: the only score that persists is on the shared server leaderboard. No local saves.
    const finalScoreEl = document.getElementById("final-score");
    const entryBlock = document.getElementById("entry-block");
    const boardBlock = document.getElementById("board-block");
    const boardList = document.getElementById("board-list");
    const charButtons = Array.from(document.querySelectorAll("#initials .char"));
    const btnSubmit = document.getElementById("btn-submit");
    const initialsState = [0, 0, 0];
    function showGameOver() {
        finalScoreEl.textContent = state.score.toLocaleString();
        entryBlock.classList.remove("hidden");
        boardBlock.classList.add("hidden");
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Carve It In";
        hud.setAttribute("aria-hidden", "true");
        overlayOver.classList.remove("hidden");
    }
    charButtons.forEach(function (btn) {
        var _a;
        const i = parseInt((_a = btn.dataset.i) !== null && _a !== void 0 ? _a : "0", 10);
        btn.addEventListener("click", function () {
            initialsState[i] = (initialsState[i] + 1) % LETTERS.length;
            btn.textContent = LETTERS[initialsState[i]];
        });
    });
    function currentInitials() { return initialsState.map(i => LETTERS[i]).join(""); }
    const tabAll = document.getElementById("tab-all");
    const tabToday = document.getElementById("tab-today");
    let lastSubmit = null;
    let boardPeriod = "all";
    btnSubmit.addEventListener("click", async function () {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Carving…";
        lastSubmit = { initials: currentInitials(), score: state.score };
        let posted = null;
        try {
            const resp = await fetch("/api/scores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ initials: lastSubmit.initials, score: lastSubmit.score, token: state.runToken }),
            });
            if (resp.ok) {
                posted = await resp.json();
            }
        }
        catch (err) { /* offline / captive weirdness */ }
        entryBlock.classList.add("hidden");
        boardBlock.classList.remove("hidden");
        // Show the all-time board (use the POST response if we got one, else fetch fresh).
        if (posted && posted.top) {
            boardPeriod = "all";
            setActiveTab();
            renderBoard(posted.top);
        }
        else {
            await loadBoard("all");
        }
    });
    async function loadBoard(period) {
        boardPeriod = period;
        setActiveTab();
        let top = [];
        try {
            const resp = await fetch("/api/scores?top=10&period=" + period);
            if (resp.ok) {
                top = await resp.json();
            }
        }
        catch (err) { /* leave board empty on failure */ }
        renderBoard(top);
    }
    function setActiveTab() {
        tabAll === null || tabAll === void 0 ? void 0 : tabAll.classList.toggle("active", boardPeriod === "all");
        tabToday === null || tabToday === void 0 ? void 0 : tabToday.classList.toggle("active", boardPeriod === "today");
    }
    // Highlight the row matching the score we just submitted (rank differs per period).
    function isMine(row) {
        return !!lastSubmit && row.initials === lastSubmit.initials && row.score === lastSubmit.score;
    }
    function renderBoard(top) {
        boardList.innerHTML = "";
        if (!top || top.length === 0) {
            const li = document.createElement("li");
            li.className = "empty";
            li.textContent = boardPeriod === "today" ? "No slayers tonight — yet." : "No souls tallied yet. Be the first.";
            boardList.appendChild(li);
            return;
        }
        let mineShown = false;
        top.forEach(function (row) {
            const li = document.createElement("li");
            if (!mineShown && isMine(row)) {
                li.className = "you";
                mineShown = true;
            }
            const r = document.createElement("span");
            r.className = "r";
            r.textContent = "#" + row.rank;
            const i = document.createElement("span");
            i.className = "i";
            i.textContent = row.initials;
            const s = document.createElement("span");
            s.className = "s";
            s.textContent = Number(row.score).toLocaleString();
            li.append(r, i, s);
            boardList.appendChild(li);
        });
    }
    tabAll === null || tabAll === void 0 ? void 0 : tabAll.addEventListener("click", () => { loadBoard("all"); });
    tabToday === null || tabToday === void 0 ? void 0 : tabToday.addEventListener("click", () => { loadBoard("today"); });
    document.getElementById("btn-start").addEventListener("click", startGame);
    document.getElementById("btn-again").addEventListener("click", startGame);
    // Persistent mute toggle (top-right). Tapping it is also a valid gesture to unlock audio.
    const btnMute = document.getElementById("btn-mute");
    function refreshMuteIcon() { if (btnMute) {
        btnMute.textContent = Sound.isMuted() ? "🔇" : "🔊";
    } }
    btnMute === null || btnMute === void 0 ? void 0 : btnMute.addEventListener("click", () => { Sound.resume(); Sound.toggleMute(); refreshMuteIcon(); Sound.sfx.ui(); });
    refreshMuteIcon();
    // Paint an idle background behind the start overlay.
    resize();
    state = freshState();
    state.camX = -viewW * CONFIG.camFollowFrac;
    state.platCursorR = state.camX - 300;
    state.platCursorL = state.camX - 300;
    seedBackground();
    ensurePlatforms();
    render();
})();
