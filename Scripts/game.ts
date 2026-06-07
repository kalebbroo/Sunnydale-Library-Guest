/*
 * Stake Night — a canvas BEAT-'EM-UP for the Sunnydale guest portal (TMNT/Streets-of-Rage
 * style): walk a 2.5D floor with depth, combo the vampires that swarm you, clear each scene,
 * follow the EXIT east through a short story, and finish on The Master.
 *
 * TypeScript source, compiled to wwwroot/js/game.js by tsc during `dotnet build`.
 *
 * Coordinates: x = world horizontal, z = floor depth (0 far/top … FLOOR_DEPTH near/bottom),
 * y = jump height. screenX = x - camX; screenY = floorTopY + z - y.
 *
 * Art: drawActor() uses a sprite sheet if loaded (see SPRITES.md), else procedural shapes.
 * Talks to /api/run/start (anti-cheat token) and /api/scores (leaderboard).
 */
(function () {
    "use strict";

    // ---- Types ------------------------------------------------------------
    interface EnemyDef { hp: number; w: number; h: number; speed: number; points: number; color: string; weight: (t: number) => number; }
    interface Enemy {
        type: string;
        x: number; z: number; y: number;
        vx: number; vz: number; stunUntil: number;   // knockback
        w: number; h: number; hp: number; def: EnemyDef;
        wobble: number; contactUntil: number; hitBy: number; alive: boolean;
        anim: string; animStart: number;
    }
    interface Player {
        x: number; z: number; y: number; vy: number;
        w: number; h: number; facing: number; moving: boolean;
        onGround: boolean; lastGroundMs: number;
        attackUntil: number; lastAttackMs: number; hurtUntil: number;
        crossbowUntil: number; scytheUntil: number;
        canThrow: boolean; lastThrowMs: number;
        lives: number; anim: string; animStart: number; _wasPower?: boolean;
    }
    interface Pickup { type: "heart" | "crossbow" | "holy" | "scythe"; x: number; z: number; bob: number; born: number; taken?: boolean; }
    interface Bolt { kind: "bolt" | "stake"; x: number; z: number; y: number; vx: number; spin: number; alive: boolean; }
    interface Dust { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; }
    interface Popup { x: number; y: number; text: string; life: number; max: number; vy: number; }
    interface Banner { text: string; until: number; }
    interface Boss {
        x: number; z: number; y: number; w: number; h: number; hp: number; maxHp: number;
        nextDashAt: number; dashUntil: number; dashVx: number; dashVz: number; contactUntil: number; hitBy: number;
    }
    interface GameState {
        running: boolean;
        phase: "playing" | "cleared";
        score: number; combo: number; bestCombo: number; elapsed: number;
        stageIndex: number; spawnedThisStage: number; defeatedThisStage: number;
        exitOpen: boolean; exitX: number; bossSpawned: boolean; victory: boolean;
        spawnTimer: number; pickupTimer: number; camX: number; attackId: number; flash: number;
        player: Player;
        enemies: Enemy[]; pickups: Pickup[]; bolts: Bolt[]; dust: Dust[];
        stars: { x: number; y: number; r: number; tw: number; par: number }[];
        graves: { x: number; w: number; h: number; par: number }[];
        boss: Boss | null; popups: Popup[]; banner: Banner | null; shake: number; runToken: string | null;
    }

    // ---- Tunables ---------------------------------------------------------
    const CONFIG = {
        floorTopFrac: 0.56, floorDepthFrac: 0.34, camLerp: 7,
        moveSpeed: 250, depthScale: 0.62, gravity: 2600, jumpVel: 720, coyoteMs: 90, jumpBufferMs: 120,
        attackCooldownMs: 300, attackMs: 160, attackReachX: 66, attackBandZ: 28, iframesMs: 1100,
        startLives: 3, maxLives: 5, baseKillPoints: 120,
        spawnStartMs: 1300, spawnMinMs: 550, spawnRampMs: 60000, maxEnemies: 12,
        pickupEveryMs: 14000, crossbowMs: 8000, boltSpeed: 700, holyRadius: 220,
        bossSpeed: 95, bossDashSpeed: 430,
        scytheMs: 9000, scytheReachMult: 1.8,
        throwCooldownMs: 600, throwSpeed: 760,
        knockImpulse: 280, knockFriction: 6, stunMs: 240,
        exitWalk: 440,                 // how far east to walk through an opened exit
    };

    const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const ENEMY_TYPES: Record<string, EnemyDef> = {
        grunt: { hp: 2, w: 30, h: 62, speed: 80, points: 120, color: "#1c1430", weight: () => 1.0 },
        runner: { hp: 1, w: 26, h: 56, speed: 150, points: 160, color: "#3a1330", weight: t => Math.max(0, t - 0.1) * 1.3 },
        brute: { hp: 4, w: 46, h: 78, speed: 55, points: 380, color: "#0f1a14", weight: t => Math.max(0, t - 0.25) * 0.9 },
    };

    // ---- Stages (data-driven scenes; last one is the boss) ----------------
    interface Palette { sky0: string; sky1: string; floor0: string; floor1: string; grave: string; }
    interface Stage { name: string; quota: number; boss?: boolean; levelUp?: boolean; palette: Palette; story: string; }
    const STAGES: Stage[] = [
        { name: "Restfield Cemetery", quota: 6, palette: { sky0: "#0b0a14", sky1: "#241a30", floor0: "#2a2440", floor1: "#15101f", grave: "#161020" },
          story: "Patrol's on. The dead don't rest in Sunnydale — clear the fledglings prowling Restfield." },
        { name: "The Crypt", quota: 8, palette: { sky0: "#0a0f14", sky1: "#16242a", floor0: "#223036", floor1: "#0e1418", grave: "#0d1a1f" },
          story: "Down into the crypt. Colder here, and something's been feeding well." },
        { name: "Sunnydale High Halls", quota: 10, levelUp: true, palette: { sky0: "#14100a", sky1: "#2a2014", floor0: "#3a2f1f", floor1: "#1a140c", grave: "#241a10" },
          story: "Back at school after dark. Giles stocked your locker — a brace of throwing stakes.\nLEVEL UP: press THROW (L) to hurl a stake!" },
        { name: "The Library", quota: 12, palette: { sky0: "#0e0a14", sky1: "#241a30", floor0: "#2e2640", floor1: "#16101f", grave: "#1a1428" },
          story: "The library sits right over the Hellmouth. They're pouring out. Hold the line." },
        { name: "The Master's Lair", quota: 0, boss: true, palette: { sky0: "#160608", sky1: "#2a0c10", floor0: "#2a1014", floor1: "#120608", grave: "#1c0a0c" },
          story: "The Master himself. This is what you were chosen for, Slayer. End it." },
    ];
    function stage(): Stage { return STAGES[Math.max(0, Math.min(state.stageIndex, STAGES.length - 1))]; }

    // ---- Sprite sheets (see SPRITES.md) -----------------------------------
    interface AnimDef { row: number; frames: number; fps: number; loop: boolean; }
    interface SheetDef { src: string; fw: number; fh: number; scale: number; anims: Record<string, AnimDef>; }
    interface SheetState { def: SheetDef; img: HTMLImageElement | null; ready: boolean; }
    const ACTOR_ANIMS: Record<string, AnimDef> = {
        idle: { row: 0, frames: 4, fps: 6, loop: true },
        walk: { row: 1, frames: 6, fps: 12, loop: true },
        attack: { row: 2, frames: 3, fps: 18, loop: false },
        hurt: { row: 3, frames: 2, fps: 10, loop: false },
    };
    const SHEETS: Record<string, SheetDef> = {
        buffy: { src: "/img/buffy.png", fw: 64, fh: 64, scale: 1.0, anims: ACTOR_ANIMS },
        grunt: { src: "/img/vamp_grunt.png", fw: 48, fh: 64, scale: 1.0, anims: ACTOR_ANIMS },
        runner: { src: "/img/vamp_runner.png", fw: 48, fh: 64, scale: 1.0, anims: ACTOR_ANIMS },
        brute: { src: "/img/vamp_brute.png", fw: 64, fh: 80, scale: 1.0, anims: ACTOR_ANIMS },
        boss: { src: "/img/master.png", fw: 80, fh: 96, scale: 1.0, anims: ACTOR_ANIMS },
    };

    // ---- Canvas -----------------------------------------------------------
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    let viewW = 0, viewH = 0, dpr = 1;
    function resize(): void {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        viewW = canvas.clientWidth || window.innerWidth;
        viewH = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.round(viewW * dpr); canvas.height = Math.round(viewH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (ctx) { ctx.imageSmoothingEnabled = false; }
    }
    window.addEventListener("resize", resize);
    function floorTopY(): number { return viewH * CONFIG.floorTopFrac; }
    function floorDepth(): number { return viewH * CONFIG.floorDepthFrac; }
    function sx(x: number): number { return x - state.camX; }
    function groundY(z: number): number { return floorTopY() + z; }
    function feetY(z: number, y: number): number { return floorTopY() + z - y; }

    // ---- Audio (Web Audio, synthesized — no asset files) ------------------
    const Sound = (function () {
        const ACtor: typeof AudioContext | undefined =
            (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
            || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        let ctxA: AudioContext | null = null; let master: GainNode | null = null;
        let muted = readMuted(); let musicId = 0; let musicStep = 0;
        function readMuted(): boolean { try { return localStorage.getItem("sn-muted") === "1"; } catch { return false; } }
        function writeMuted(v: boolean): void { try { localStorage.setItem("sn-muted", v ? "1" : "0"); } catch { /* no storage */ } }
        function ensure(): void {
            if (ctxA || !ACtor) { return; }
            try { ctxA = new ACtor(); master = ctxA.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctxA.destination); }
            catch { ctxA = null; master = null; }
        }
        function resume(): void { ensure(); if (ctxA && ctxA.state === "suspended") { ctxA.resume().catch(() => { /* ignore */ }); } }
        function blip(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
            if (!ctxA || !master || muted) { return; }
            const t = ctxA.currentTime; const o = ctxA.createOscillator(); const g = ctxA.createGain();
            o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
            g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
        }
        function burst(dur: number, vol: number): void {
            if (!ctxA || !master || muted) { return; }
            const t = ctxA.currentTime; const n = Math.max(1, Math.floor(ctxA.sampleRate * dur));
            const buf = ctxA.createBuffer(1, n, ctxA.sampleRate); const data = buf.getChannelData(0);
            for (let i = 0; i < n; i++) { data[i] = (Math.random() * 2 - 1) * (1 - i / n); }
            const src = ctxA.createBufferSource(); src.buffer = buf; const g = ctxA.createGain();
            g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            const hp = ctxA.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 700;
            src.connect(hp); hp.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
        }
        const sfx = {
            hit() { burst(0.09, 0.5); blip(420, 90, 0.10, "square", 0.18); },
            whiff() { blip(300, 150, 0.08, "sine", 0.12); },
            hurt() { blip(220, 55, 0.30, "sawtooth", 0.35); },
            pickup() { blip(520, 990, 0.14, "triangle", 0.30); },
            jump() { blip(300, 620, 0.10, "square", 0.16); },
            shoot() { blip(900, 300, 0.08, "square", 0.18); },
            stage() { blip(440, 880, 0.25, "triangle", 0.22); },
            levelup() { blip(523, 1046, 0.18, "square", 0.25); blip(784, 1568, 0.22, "square", 0.18); },
            bossIn() { blip(120, 55, 0.70, "sawtooth", 0.40); },
            bossDown() { burst(0.5, 0.5); blip(220, 40, 0.60, "sawtooth", 0.40); },
            over() { blip(440, 90, 0.60, "triangle", 0.30); },
            win() { blip(523, 784, 0.18, "square", 0.22); blip(659, 988, 0.22, "square", 0.2); },
            ui() { blip(620, 620, 0.05, "square", 0.12); },
        };
        const BASS = [110.00, 110.00, 130.81, 146.83, 110.00, 98.00, 130.81, 164.81];
        function startMusic(): void {
            if (!ctxA || musicId) { return; }
            musicStep = 0;
            musicId = (setInterval(function () {
                if (!ctxA || muted) { return; }
                const f = BASS[musicStep % BASS.length]; musicStep++;
                blip(f, f, 0.22, "triangle", 0.06);
                if (musicStep % 4 === 0) { blip(f * 2, f * 2, 0.10, "sine", 0.025); }
            }, 300) as unknown) as number;
        }
        function stopMusic(): void { if (musicId) { clearInterval(musicId); musicId = 0; } }
        function toggleMute(): boolean { muted = !muted; writeMuted(muted); if (master) { master.gain.value = muted ? 0 : 0.5; } return muted; }
        function isMuted(): boolean { return muted; }
        return { resume, sfx, startMusic, stopMusic, toggleMute, isMuted };
    })();

    let nowMs = 0;

    // ---- Input ------------------------------------------------------------
    const input = { left: false, right: false, up: false, down: false, jumpBufferedAt: -1e9 };
    const held = new Set<string>();
    function pressJump(): void { input.jumpBufferedAt = nowMs; }
    function syncDirs(): void {
        input.left = held.has("arrowleft") || held.has("a");
        input.right = held.has("arrowright") || held.has("d");
        input.up = held.has("arrowup") || held.has("w");
        input.down = held.has("arrowdown") || held.has("s");
    }
    function keyDown(e: KeyboardEvent): void {
        const k = e.key.toLowerCase();
        if (["arrowleft", "a", "arrowright", "d", "arrowup", "w", "arrowdown", "s"].includes(k)) { held.add(k); syncDirs(); e.preventDefault(); }
        else if (k === " " || k === "spacebar" || k === "j" || k === "x" || k === "enter" || e.code === "Space") { tryAttack(); e.preventDefault(); }
        else if (k === "k" || k === "shift") { pressJump(); e.preventDefault(); }
        else if (k === "l" || k === ";") { tryThrow(); e.preventDefault(); }
    }
    function keyUp(e: KeyboardEvent): void { held.delete(e.key.toLowerCase()); syncDirs(); }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    canvas.addEventListener("pointerdown", function (e: PointerEvent) { e.preventDefault(); tryAttack(); }, { passive: false });
    function bindHold(el: HTMLElement | null, on: (v: boolean) => void): void {
        if (!el) { return; }
        const set = (v: boolean) => () => { on(v); };
        el.addEventListener("pointerdown", (e: PointerEvent) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); on(true); }, { passive: false });
        el.addEventListener("pointerup", (e: PointerEvent) => { e.preventDefault(); on(false); }, { passive: false });
        el.addEventListener("pointercancel", set(false));
        el.addEventListener("pointerleave", set(false));
    }
    function bindTap(el: HTMLElement | null, fn: () => void): void {
        if (!el) { return; }
        el.addEventListener("pointerdown", (e: PointerEvent) => { e.preventDefault(); fn(); }, { passive: false });
    }
    bindHold(document.getElementById("btn-left"), v => { input.left = v; });
    bindHold(document.getElementById("btn-right"), v => { input.right = v; });
    bindHold(document.getElementById("btn-up"), v => { input.up = v; });
    bindHold(document.getElementById("btn-down"), v => { input.down = v; });
    bindTap(document.getElementById("btn-attack"), tryAttack);
    bindTap(document.getElementById("btn-jump"), pressJump);
    bindTap(document.getElementById("btn-throw"), tryThrow);

    // ---- Sprite loader ----------------------------------------------------
    const sheets: Record<string, SheetState> = {};
    function loadSheets(): void {
        if (typeof Image === "undefined") { return; }
        for (const key of Object.keys(SHEETS)) {
            const def = SHEETS[key]; const stt: SheetState = { def, img: null, ready: false };
            try { const img = new Image(); img.onload = () => { stt.img = img; stt.ready = true; }; img.onerror = () => { stt.ready = false; }; img.src = def.src; } catch { /* ignore */ }
            sheets[key] = stt;
        }
    }
    function drawSheet(kind: string, anim: string, animStart: number, fxp: number, fyp: number, facing: number): boolean {
        const stt = sheets[kind];
        if (!stt || !stt.ready || !stt.img) { return false; }
        const def = stt.def; const a = def.anims[anim] || def.anims.idle;
        let frame = Math.floor(((nowMs - animStart) / 1000) * a.fps);
        frame = a.loop ? frame % a.frames : Math.min(frame, a.frames - 1);
        const w = def.fw * def.scale, h = def.fh * def.scale;
        ctx.save(); ctx.translate(fxp, fyp); ctx.scale(facing, 1);
        ctx.drawImage(stt.img, frame * def.fw, a.row * def.fh, def.fw, def.fh, -w / 2, -h, w, h);
        ctx.restore();
        return true;
    }

    // ---- State ------------------------------------------------------------
    let state!: GameState;
    let projHitId = -1;

    function freshPlayer(): Player {
        return {
            x: 0, z: floorDepth() * 0.5, y: 0, vy: 0, w: 30, h: 64, facing: 1, moving: false,
            onGround: true, lastGroundMs: 0, attackUntil: -1e9, lastAttackMs: -1e9, hurtUntil: -1e9,
            crossbowUntil: -1e9, scytheUntil: -1e9, canThrow: false, lastThrowMs: -1e9,
            lives: CONFIG.startLives, anim: "idle", animStart: 0,
        };
    }
    function freshState(): GameState {
        return {
            running: false, phase: "playing", score: 0, combo: 0, bestCombo: 0, elapsed: 0,
            stageIndex: 0, spawnedThisStage: 0, defeatedThisStage: 0,
            exitOpen: false, exitX: 0, bossSpawned: false, victory: false,
            spawnTimer: 700, pickupTimer: CONFIG.pickupEveryMs, camX: 0, attackId: 0, flash: 0,
            player: freshPlayer(), enemies: [], pickups: [], bolts: [], dust: [], stars: [], graves: [],
            boss: null, popups: [], banner: null, shake: 0, runToken: null,
        };
    }

    function seedBackground(): void {
        state.stars = [];
        const count = Math.round((viewW * floorTopY()) / 9000);
        for (let i = 0; i < count; i++) { state.stars.push({ x: Math.random() * viewW, y: Math.random() * floorTopY() * 0.9, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2, par: 0.2 + Math.random() * 0.2 }); }
        state.graves = [];
        const graveCount = Math.max(6, Math.round(viewW / 120));
        for (let i = 0; i < graveCount * 3; i++) { state.graves.push({ x: (i - graveCount) * 150 + Math.random() * 90, w: 30 + Math.random() * 26, h: 40 + Math.random() * 34, par: 0.5 }); }
    }

    // ---- Spawning ---------------------------------------------------------
    function difficultyT(): number { return Math.min(1, state.elapsed / CONFIG.spawnRampMs); }
    function pickEnemyType(): string {
        const t = difficultyT();
        const entries = Object.entries(ENEMY_TYPES).map(([k, v]) => [k, Math.max(0, v.weight(t))] as [string, number]);
        const total = entries.reduce((s, [, w]) => s + w, 0);
        let r = Math.random() * total;
        for (const [k, w] of entries) { if ((r -= w) <= 0) { return k; } }
        return "grunt";
    }
    function spawnEnemy(): void {
        if (state.enemies.length >= CONFIG.maxEnemies) { return; }
        const typeKey = pickEnemyType(); const def = ENEMY_TYPES[typeKey];
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side > 0 ? state.camX + viewW + 50 : state.camX - 50;
        state.enemies.push({
            type: typeKey, x, z: Math.random() * floorDepth(), y: 0, vx: 0, vz: 0, stunUntil: -1e9,
            w: def.w, h: def.h, hp: def.hp, def, wobble: Math.random() * Math.PI * 2,
            contactUntil: -1e9, hitBy: -1, alive: true, anim: "walk", animStart: nowMs,
        });
        state.spawnedThisStage++;
    }
    function spawnPickup(): void {
        const roll = Math.random();
        const type: Pickup["type"] = roll < 0.16 ? "heart" : roll < 0.46 ? "crossbow" : roll < 0.73 ? "scythe" : "holy";
        state.pickups.push({ type, x: state.player.x + state.player.facing * (200 + Math.random() * 240), z: Math.random() * floorDepth(), bob: Math.random() * Math.PI * 2, born: nowMs });
    }
    function spawnBoss(): void {
        const hp = 26;
        state.boss = {
            x: state.camX + viewW + 80, z: floorDepth() * 0.5, y: 0, w: 60, h: 96, hp, maxHp: hp,
            nextDashAt: nowMs + 1800, dashUntil: -1e9, dashVx: 0, dashVz: 0, contactUntil: -1e9, hitBy: -1,
        };
        state.bossSpawned = true;
        Sound.sfx.bossIn();
    }

    // ---- Combat -----------------------------------------------------------
    function tryAttack(): void {
        if (!state || !state.running) { return; }
        const p = state.player;
        if (nowMs - p.lastAttackMs < CONFIG.attackCooldownMs) { return; }
        p.lastAttackMs = nowMs; p.attackUntil = nowMs + CONFIG.attackMs; p.anim = "attack"; p.animStart = nowMs;
        state.attackId++;
        if (nowMs < p.crossbowUntil) { fire("bolt"); Sound.sfx.shoot(); return; }

        const scythe = nowMs < p.scytheUntil;
        const reach = scythe ? CONFIG.attackReachX * CONFIG.scytheReachMult : CONFIG.attackReachX;
        const band = scythe ? CONFIG.attackBandZ * 1.6 : CONFIG.attackBandZ;
        const cx = p.x + p.facing * (reach * 0.5 + p.w * 0.5);
        let hitAny = false;
        for (const e of state.enemies) {
            if (!e.alive || e.hitBy === state.attackId) { continue; }
            if (Math.abs(e.x - cx) < reach * 0.5 + e.w * 0.5 && Math.abs(e.z - p.z) < band && (e.x - p.x) * p.facing > -8) { hitEnemy(e, state.attackId, scythe); hitAny = true; }
        }
        if (state.boss) {
            const b = state.boss;
            if (Math.abs(b.x - cx) < reach * 0.5 + b.w * 0.5 && Math.abs(b.z - p.z) < band + 10 && (b.x - p.x) * p.facing > -8 && b.hitBy !== state.attackId) { b.hitBy = state.attackId; damageBoss(scythe ? 3 : 1); hitAny = true; }
        }
        if (!hitAny) { state.combo = 0; Sound.sfx.whiff(); updateHud(); }
    }

    function tryThrow(): void {
        if (!state || !state.running) { return; }
        const p = state.player;
        if (!p.canThrow || nowMs - p.lastThrowMs < CONFIG.throwCooldownMs) { return; }
        p.lastThrowMs = nowMs; p.attackUntil = nowMs + CONFIG.attackMs; p.anim = "attack"; p.animStart = nowMs;
        fire("stake"); Sound.sfx.shoot();
    }

    function fire(kind: "bolt" | "stake"): void {
        const p = state.player;
        const speed = kind === "stake" ? CONFIG.throwSpeed : CONFIG.boltSpeed;
        state.bolts.push({ kind, x: p.x + p.facing * 18, z: p.z, y: p.h * 0.55, vx: p.facing * speed, spin: 0, alive: true });
    }

    function knockback(e: Enemy, lethal: boolean): void {
        const p = state.player;
        const dirx = (Math.sign(e.x - p.x) || p.facing);
        const resist = e.type === "brute" ? 0.45 : 1;
        e.vx = dirx * CONFIG.knockImpulse * resist * (lethal ? 1.5 : 1);
        e.vz = (e.z - p.z >= 0 ? 1 : -1) * 40 * resist;
        e.stunUntil = nowMs + CONFIG.stunMs;
    }

    function hitEnemy(e: Enemy, attackId: number, lethal: boolean = false): void {
        e.hitBy = attackId; Sound.sfx.hit();
        if (lethal) { e.hp = 1; }
        e.hp--;
        knockback(e, e.hp <= 0);
        if (e.hp > 0) { spawnDust(e.x, feetY(e.z, 0) - e.h * 0.5, 6, "#8a6a9a"); e.anim = "hurt"; e.animStart = nowMs; return; }
        e.alive = false;
        state.defeatedThisStage++;
        state.combo++; state.bestCombo = Math.max(state.bestCombo, state.combo);
        const gained = Math.round(e.def.points * (1 + Math.floor(state.combo / 5) * 0.5));
        state.score += gained;
        spawnDust(e.x, feetY(e.z, 0) - e.h * 0.5, 16, "#c9b8d6");
        spawnPopup(e.x, feetY(e.z, 0) - e.h, "+" + gained);
        updateHud();
    }

    function damageBoss(n: number): void {
        const b = state.boss; if (!b) { return; }
        b.hp -= n; spawnDust(b.x, feetY(b.z, 0) - b.h * 0.5, 8, "#ff7b7b");
        if (b.hp <= 0) {
            state.score += 2500; state.combo += 5;
            spawnDust(b.x, feetY(b.z, 0) - b.h * 0.5, 40, "#f4ecc6");
            spawnPopup(b.x, feetY(b.z, 0) - b.h, "+2500");
            state.flash = 0.9; state.shake = Math.max(state.shake, 18);
            Sound.sfx.bossDown(); state.boss = null;
            endGame(true);   // boss only exists on the finale stage → victory
        }
        updateHud();
    }

    function hurtPlayer(): void {
        const p = state.player;
        if (nowMs < p.hurtUntil) { return; }
        p.hurtUntil = nowMs + CONFIG.iframesMs; p.lives--; state.combo = 0;
        state.flash = Math.max(state.flash, 0.4); state.shake = Math.max(state.shake, 7);
        Sound.sfx.hurt(); updateHud();
        if (p.lives <= 0) { endGame(false); }
    }

    function spawnDust(x: number, screenYy: number, n: number, color?: string): void {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 140;
            state.dust.push({ x, y: screenYy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0, max: 0.45 + Math.random() * 0.4, color: color || "#c9b8d6" });
        }
    }
    function spawnPopup(x: number, screenYy: number, text: string): void { state.popups.push({ x, y: screenYy, text, life: 0, max: 0.8, vy: -60 }); }

    function applyPickup(pk: Pickup): void {
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

    // ---- Update -----------------------------------------------------------
    function update(dt: number): void {
        state.elapsed += dt * 1000;
        const p = state.player;

        const dirX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const dirZ = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        p.x += dirX * CONFIG.moveSpeed * dt;
        p.z += dirZ * CONFIG.moveSpeed * CONFIG.depthScale * dt;
        p.z = Math.max(0, Math.min(floorDepth(), p.z));
        if (dirX !== 0) { p.facing = dirX; }
        p.moving = (dirX !== 0 || dirZ !== 0);

        const canCoyote = p.onGround || (nowMs - p.lastGroundMs) < CONFIG.coyoteMs;
        if (nowMs - input.jumpBufferedAt < CONFIG.jumpBufferMs && canCoyote) { p.vy = CONFIG.jumpVel; p.onGround = false; input.jumpBufferedAt = -1e9; p.lastGroundMs = -1e9; Sound.sfx.jump(); }
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

        // Enemies: knockback while stunned, else swarm the player in x+z.
        for (const e of state.enemies) {
            if (!e.alive) { continue; }
            if (nowMs < e.stunUntil) {
                e.x += e.vx * dt; e.z += e.vz * dt;
                const f = Math.min(1, CONFIG.knockFriction * dt); e.vx -= e.vx * f; e.vz -= e.vz * f;
                e.z = Math.max(0, Math.min(floorDepth(), e.z));
            } else {
                const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz) || 1;
                e.x += (dx / dist) * e.def.speed * dt;
                e.z += (dz / dist) * e.def.speed * CONFIG.depthScale * dt;
                e.wobble += dt * 6;
                if (Math.abs(e.x - p.x) < (e.w + p.w) * 0.5 && Math.abs(e.z - p.z) < 20 && p.y < 30 && nowMs > e.contactUntil) { e.contactUntil = nowMs + 700; hurtPlayer(); }
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

    function updateBoss(dt: number): void {
        const b = state.boss; if (!b) { return; }
        const p = state.player;
        if (nowMs < b.dashUntil) { b.x += b.dashVx * dt; b.z += b.dashVz * dt; }
        else {
            const dx = p.x - b.x, dz = p.z - b.z, dist = Math.hypot(dx, dz) || 1;
            b.x += (dx / dist) * CONFIG.bossSpeed * dt; b.z += (dz / dist) * CONFIG.bossSpeed * CONFIG.depthScale * dt;
            if (nowMs >= b.nextDashAt) { b.dashUntil = nowMs + 380; b.dashVx = (dx / dist) * CONFIG.bossDashSpeed; b.dashVz = (dz / dist) * CONFIG.bossDashSpeed * CONFIG.depthScale; b.nextDashAt = nowMs + 2200; }
        }
        b.z = Math.max(0, Math.min(floorDepth(), b.z));
        if (Math.abs(b.x - p.x) < (b.w + p.w) * 0.5 && Math.abs(b.z - p.z) < 24 && nowMs > b.contactUntil) { b.contactUntil = nowMs + 800; hurtPlayer(); }
    }

    // ---- Render -----------------------------------------------------------
    function render(): void {
        const ftY = floorTopY(); const pal = stage().palette; const OS = 26;
        const shx = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
        const shy = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
        ctx.save(); ctx.translate(shx, shy);

        const sky = ctx.createLinearGradient(0, 0, 0, ftY);
        sky.addColorStop(0, pal.sky0); sky.addColorStop(1, pal.sky1);
        ctx.fillStyle = sky; ctx.fillRect(-OS, -OS, viewW + OS * 2, ftY + OS);

        for (const s of state.stars) {
            const px = ((s.x - state.camX * s.par) % viewW + viewW) % viewW;
            ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw + nowMs / 600)); ctx.fillStyle = "#fdf6d8";
            ctx.beginPath(); ctx.arc(px, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#f4ecc6"; ctx.beginPath(); ctx.arc(viewW * 0.8, ftY * 0.26, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(11,10,20,0.55)"; ctx.beginPath(); ctx.arc(viewW * 0.8 + 12, ftY * 0.26 - 6, 30, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = pal.grave;
        for (const g of state.graves) {
            const gx = g.x - state.camX * g.par; const px = ((gx % (viewW + 400)) + (viewW + 400)) % (viewW + 400) - 200;
            ctx.beginPath(); ctx.moveTo(px - g.w / 2, ftY); ctx.lineTo(px - g.w / 2, ftY - g.h * 0.55);
            ctx.arc(px, ftY - g.h * 0.55, g.w / 2, Math.PI, 0); ctx.lineTo(px + g.w / 2, ftY); ctx.closePath(); ctx.fill();
        }

        const floor = ctx.createLinearGradient(0, ftY, 0, ftY + floorDepth());
        floor.addColorStop(0, pal.floor0); floor.addColorStop(1, pal.floor1);
        ctx.fillStyle = floor; ctx.fillRect(-OS, ftY, viewW + OS * 2, floorDepth() + OS);
        ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.beginPath(); ctx.moveTo(0, ftY); ctx.lineTo(viewW, ftY); ctx.stroke();

        ctx.fillStyle = "rgba(0,0,0,0.28)";
        const shadow = (x: number, z: number, w: number) => { ctx.beginPath(); ctx.ellipse(sx(x), groundY(z), w * 0.5, w * 0.22, 0, 0, Math.PI * 2); ctx.fill(); };
        for (const e of state.enemies) { if (e.alive) { shadow(e.x, e.z, e.w); } }
        for (const pk of state.pickups) { shadow(pk.x, pk.z, 22); }
        if (state.boss) { shadow(state.boss.x, state.boss.z, state.boss.w); }
        shadow(state.player.x, state.player.z, state.player.w);

        type Draw = { z: number; render: () => void };
        const list: Draw[] = [];
        for (const e of state.enemies) { if (e.alive) { list.push({ z: e.z, render: () => drawEnemy(e) }); } }
        for (const pk of state.pickups) { list.push({ z: pk.z, render: () => drawPickup(pk) }); }
        if (state.boss) { const b = state.boss; list.push({ z: b.z, render: () => drawBoss(b) }); }
        list.push({ z: state.player.z, render: drawBuffy });
        list.sort((a, b) => a.z - b.z);
        for (const d of list) { d.render(); }

        // Projectiles.
        for (const b of state.bolts) {
            const bx = sx(b.x), by = feetY(b.z, b.y);
            if (b.kind === "stake") {
                ctx.save(); ctx.translate(bx, by); ctx.rotate(b.spin);
                ctx.fillStyle = "#8a5a2b"; ctx.fillRect(-9, -2, 18, 4);
                ctx.fillStyle = "#d9b27a"; ctx.fillRect(6, -2, 3, 4);
                ctx.restore();
            } else { ctx.fillStyle = "#e8c659"; ctx.fillRect(bx - 8, by - 1.5, 16, 3); }
        }

        for (const d of state.dust) { const k = 1 - d.life / d.max; ctx.globalAlpha = Math.max(0, k); ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sx(d.x), d.y, 2 + k * 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;

        ctx.font = "bold 16px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (const pop of state.popups) { ctx.globalAlpha = Math.max(0, 1 - pop.life / pop.max); ctx.fillStyle = "#f4ecc6"; ctx.fillText(pop.text, sx(pop.x), pop.y); }
        ctx.globalAlpha = 1;

        // EXIT arrow (when a scene is cleared).
        if (state.exitOpen) {
            const ax = viewW - 60, ay = ftY + floorDepth() * 0.45, pulse = 0.6 + 0.4 * Math.sin(nowMs / 200);
            ctx.globalAlpha = pulse; ctx.fillStyle = "#e8c659";
            ctx.beginPath(); ctx.moveTo(ax - 24, ay - 18); ctx.lineTo(ax + 10, ay); ctx.lineTo(ax - 24, ay + 18); ctx.closePath(); ctx.fill();
            ctx.fillRect(ax - 44, ay - 7, 22, 14);
            ctx.globalAlpha = 1; ctx.fillStyle = "#e8c659"; ctx.font = "bold 13px Georgia, serif"; ctx.textAlign = "center";
            ctx.fillText("EXIT", ax - 14, ay - 28);
        }

        ctx.restore();

        if (state.flash > 0) { ctx.fillStyle = `rgba(255,240,220,${state.flash * 0.5})`; ctx.fillRect(0, 0, viewW, viewH); }
        if (state.banner) {
            ctx.globalAlpha = Math.min(1, (state.banner.until - nowMs) / 500); ctx.fillStyle = "#ffd76b";
            ctx.font = "italic bold 26px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(state.banner.text, viewW / 2, viewH * 0.26); ctx.globalAlpha = 1;
        }
    }

    function drawBuffy(): void {
        const p = state.player; const fx = sx(p.x), fy = feetY(p.z, p.y);
        if (drawSheet("buffy", p.anim, p.animStart, fx, fy, p.facing)) { return; }
        const lunging = nowMs < p.attackUntil;
        const hurtBlink = nowMs < p.hurtUntil && (Math.floor(nowMs / 80) % 2 === 0);
        ctx.save(); ctx.translate(fx, fy); ctx.scale(p.facing, 1);
        if (hurtBlink) { ctx.globalAlpha = 0.4; }
        ctx.fillStyle = "#27313f"; ctx.fillRect(-9, -22, 18, 22);
        ctx.fillStyle = "#7a2233"; ctx.fillRect(-9, -54, 18, 34);
        ctx.fillStyle = "#f0c9a0"; ctx.beginPath(); ctx.arc(0, -62, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e8c659"; ctx.beginPath(); ctx.arc(0, -64, 9.5, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(-9.5, -64, 4, 12); ctx.fillRect(5.5, -64, 4, 12);
        const reach = lunging ? 30 : 20; ctx.strokeStyle = "#f0c9a0"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(6, -46); ctx.lineTo(reach, -44); ctx.stroke();
        if (nowMs < p.crossbowUntil) { ctx.strokeStyle = "#5a4632"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(reach, -48); ctx.lineTo(reach + 4, -40); ctx.stroke(); }
        else if (nowMs < p.scytheUntil) {
            const bl = reach + (lunging ? 32 : 26); ctx.strokeStyle = "#6a5238"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(reach, -44); ctx.lineTo(bl, -44); ctx.stroke();
            ctx.strokeStyle = "#c7ccd2"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bl, -44); ctx.quadraticCurveTo(bl + 6, -58, bl - 8, -60); ctx.stroke();
        } else { ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(reach, -44); ctx.lineTo(reach + (lunging ? 16 : 14), -44); ctx.stroke(); }
        ctx.restore();
    }

    function drawEnemy(e: Enemy): void {
        const fx = sx(e.x), fy = feetY(e.z, e.y);
        if (drawSheet(e.type, e.anim, e.animStart, fx, fy, Math.sign(state.player.x - e.x) || 1)) { return; }
        const bob = Math.sin(e.wobble) * 3;
        ctx.save(); ctx.translate(fx, fy + bob);
        ctx.fillStyle = "#0f0a1c"; ctx.fillRect(-e.w / 2, -22, e.w, 22);
        ctx.fillStyle = e.def.color; ctx.fillRect(-e.w / 2, -e.h + 10, e.w, e.h - 32);
        ctx.fillStyle = "#b9a6c4"; ctx.beginPath(); ctx.arc(0, -e.h + 8, e.w * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff3b3b"; ctx.fillRect(-5, -e.h + 6, 3, 3); ctx.fillRect(2, -e.h + 6, 3, 3);
        if (e.hp < e.def.hp) { ctx.fillStyle = "#7a2233"; ctx.fillRect(-e.w / 2, -e.h + 2, e.w * (e.hp / e.def.hp), 3); }
        ctx.restore();
    }

    function drawBoss(b: Boss): void {
        const fx = sx(b.x), fy = feetY(b.z, b.y);
        if (drawSheet("boss", "walk", nowMs, fx, fy, Math.sign(state.player.x - b.x) || 1)) { return; }
        ctx.save(); ctx.translate(fx, fy);
        ctx.fillStyle = "#0a0610"; ctx.fillRect(-b.w / 2, -b.h, b.w, b.h);
        ctx.fillStyle = "#2a1030"; ctx.fillRect(-b.w / 2 + 4, -b.h + 6, b.w - 8, b.h - 30);
        ctx.fillStyle = "#cdbcd6"; ctx.beginPath(); ctx.arc(0, -b.h + 16, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff2020"; ctx.fillRect(-9, -b.h + 12, 6, 6); ctx.fillRect(3, -b.h + 12, 6, 6);
        ctx.restore();
    }

    function drawPickup(pk: Pickup): void {
        const x = sx(pk.x), y = feetY(pk.z, 0) - 18 + Math.sin(pk.bob) * 4;
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = "rgba(232,198,89,0.18)"; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
        if (pk.type === "heart") { ctx.fillStyle = "#c83b54"; ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("❤", 0, 1); }
        else if (pk.type === "crossbow") { ctx.strokeStyle = "#e8c659"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); }
        else if (pk.type === "scythe") { ctx.strokeStyle = "#6a5238"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, 9); ctx.lineTo(2, -9); ctx.stroke(); ctx.strokeStyle = "#c7ccd2"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2, -9); ctx.quadraticCurveTo(-9, -9, -8, 0); ctx.stroke(); }
        else { ctx.fillStyle = "#bfe3ff"; ctx.fillRect(-5, -8, 10, 14); ctx.fillStyle = "#fff"; ctx.fillRect(-3, -11, 6, 4); }
        ctx.restore();
    }

    // ---- HUD --------------------------------------------------------------
    const hud = document.getElementById("hud") as HTMLElement;
    const hudScore = document.getElementById("hud-score") as HTMLElement;
    const hudCombo = document.getElementById("hud-combo") as HTMLElement;
    const hudLives = document.getElementById("hud-lives") as HTMLElement;
    const hudPower = document.getElementById("hud-power") as HTMLElement | null;
    const hudStage = document.getElementById("hud-stage") as HTMLElement | null;
    const bossBar = document.getElementById("boss-bar") as HTMLElement | null;
    const bossName = document.getElementById("boss-name") as HTMLElement | null;
    const bossFill = document.getElementById("boss-hp-fill") as HTMLElement;

    function updateHud(): void {
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
            hudStage.textContent = s.boss ? s.name + " — BOSS"
                : state.phase === "cleared" ? s.name + " — CLEAR →"
                : s.name + "  " + Math.min(state.defeatedThisStage, s.quota) + "/" + s.quota;
        }
        if (bossBar) {
            if (state.boss) { bossBar.classList.remove("hidden"); if (bossName) { bossName.textContent = stage().name; } bossFill.style.width = Math.max(0, (state.boss.hp / state.boss.maxHp) * 100) + "%"; }
            else { bossBar.classList.add("hidden"); }
        }
    }

    // ---- Loop -------------------------------------------------------------
    let rafId = 0, lastTs = 0, paused = false;
    function frame(ts: number): void {
        if (!state.running || paused) { return; }
        if (!lastTs) { lastTs = ts; }
        nowMs = ts; let dt = (ts - lastTs) / 1000; lastTs = ts; if (dt > 0.05) { dt = 0.05; }
        update(dt);
        if (state.running && !paused) { render(); rafId = requestAnimationFrame(frame); }
    }

    // ---- Stage flow + lifecycle -------------------------------------------
    const overlayStart = document.getElementById("overlay-start") as HTMLElement;
    const overlayOver = document.getElementById("overlay-over") as HTMLElement;
    const overlayStory = document.getElementById("overlay-story") as HTMLElement | null;
    const storyTitle = document.getElementById("story-title") as HTMLElement | null;
    const storyText = document.getElementById("story-text") as HTMLElement | null;
    const controls = document.getElementById("controls") as HTMLElement | null;
    const btnThrow = document.getElementById("btn-throw") as HTMLElement | null;
    let storyContinue: (() => void) | null = null;

    function requestRunToken(): void {
        fetch("/api/run/start", { method: "POST" }).then(r => r.ok ? r.json() : null)
            .then((d: { token?: string } | null) => { if (d && d.token && state) { state.runToken = d.token; } }).catch(() => { /* offline */ });
    }

    function showStory(s: Stage, idx: number, onContinue: () => void): void {
        cancelAnimationFrame(rafId);
        paused = true;
        storyContinue = onContinue;
        if (storyTitle) { storyTitle.textContent = "Stage " + (idx + 1) + " · " + s.name; }
        if (storyText) { storyText.textContent = s.story; }
        if (controls) { controls.classList.add("hidden"); }
        if (overlayStory) { overlayStory.classList.remove("hidden"); }
    }
    function continueStory(): void {
        const cb = storyContinue; storyContinue = null;
        if (overlayStory) { overlayStory.classList.add("hidden"); }
        if (cb) { cb(); }
    }

    function enterStage(i: number): void {
        state.stageIndex = i;
        state.spawnedThisStage = 0; state.defeatedThisStage = 0; state.exitOpen = false; state.bossSpawned = false;
        state.enemies = []; state.bolts = []; state.pickups = [];
        state.camX = state.player.x - viewW * 0.5;
        seedBackground();
        const s = STAGES[i];
        if (s.levelUp) { state.player.canThrow = true; if (btnThrow) { btnThrow.classList.remove("hidden"); } Sound.sfx.levelup(); }
        showStory(s, i, () => beginStage(s));
    }
    function beginStage(s: Stage): void {
        state.phase = "playing"; state.spawnTimer = 500;
        if (s.boss) { spawnBoss(); }
        state.banner = { text: s.name, until: nowMs + 2200 };
        Sound.sfx.stage();
        if (controls) { controls.classList.remove("hidden"); controls.setAttribute("aria-hidden", "false"); }
        updateHud();
        paused = false; lastTs = 0; rafId = requestAnimationFrame(frame);
    }

    function startGame(): void {
        resize(); Sound.resume(); Sound.startMusic();
        state = freshState(); requestRunToken();
        state.running = true;
        held.clear(); input.left = input.right = input.up = input.down = false; input.jumpBufferedAt = -1e9;
        overlayStart.classList.add("hidden"); overlayOver.classList.add("hidden");
        if (btnThrow) { btnThrow.classList.add("hidden"); }
        hud.setAttribute("aria-hidden", "false"); updateHud();
        enterStage(0);
    }
    function advanceStage(): void {
        if (state.stageIndex + 1 < STAGES.length) { enterStage(state.stageIndex + 1); }
    }

    function endGame(victory: boolean): void {
        state.running = false; state.victory = victory;
        cancelAnimationFrame(rafId);
        Sound.stopMusic(); if (victory) { Sound.sfx.win(); } else { Sound.sfx.over(); }
        render();
        if (controls) { controls.classList.add("hidden"); controls.setAttribute("aria-hidden", "true"); }
        if (bossBar) { bossBar.classList.add("hidden"); }
        showGameOver(victory);
    }

    // ---- Game over: initials + leaderboard --------------------------------
    const overTitle = document.getElementById("over-title") as HTMLElement | null;
    const finalScoreEl = document.getElementById("final-score") as HTMLElement;
    const entryBlock = document.getElementById("entry-block") as HTMLElement;
    const boardBlock = document.getElementById("board-block") as HTMLElement;
    const boardList = document.getElementById("board-list") as HTMLElement;
    const charButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#initials .char"));
    const btnSubmit = document.getElementById("btn-submit") as HTMLButtonElement;
    const initialsState = [0, 0, 0];

    function showGameOver(victory: boolean): void {
        if (overTitle) { overTitle.textContent = victory ? "Sunnydale Saved" : "Dawn Breaks"; }
        finalScoreEl.textContent = state.score.toLocaleString();
        entryBlock.classList.remove("hidden"); boardBlock.classList.add("hidden");
        btnSubmit.disabled = false; btnSubmit.textContent = "Carve It In";
        hud.setAttribute("aria-hidden", "true"); overlayOver.classList.remove("hidden");
    }

    charButtons.forEach(function (btn) {
        const i = parseInt(btn.dataset.i ?? "0", 10);
        btn.addEventListener("click", function () { initialsState[i] = (initialsState[i] + 1) % LETTERS.length; btn.textContent = LETTERS[initialsState[i]]; });
    });
    function currentInitials(): string { return initialsState.map(i => LETTERS[i]).join(""); }

    type Row = { rank: number; initials: string; score: number };
    const tabAll = document.getElementById("tab-all") as HTMLElement | null;
    const tabToday = document.getElementById("tab-today") as HTMLElement | null;
    let lastSubmit: { initials: string; score: number } | null = null;
    let boardPeriod: "all" | "today" = "all";

    btnSubmit.addEventListener("click", async function () {
        btnSubmit.disabled = true; btnSubmit.textContent = "Carving…";
        lastSubmit = { initials: currentInitials(), score: state.score };
        let posted: { top: Row[] } | null = null;
        try {
            const resp = await fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initials: lastSubmit.initials, score: lastSubmit.score, token: state.runToken }) });
            if (resp.ok) { posted = await resp.json(); }
        } catch (err) { /* offline */ }
        entryBlock.classList.add("hidden"); boardBlock.classList.remove("hidden");
        if (posted && posted.top) { boardPeriod = "all"; setActiveTab(); renderBoard(posted.top); } else { await loadBoard("all"); }
    });
    async function loadBoard(period: "all" | "today"): Promise<void> {
        boardPeriod = period; setActiveTab(); let top: Row[] = [];
        try { const resp = await fetch("/api/scores?top=10&period=" + period); if (resp.ok) { top = await resp.json(); } } catch (err) { /* empty */ }
        renderBoard(top);
    }
    function setActiveTab(): void { tabAll?.classList.toggle("active", boardPeriod === "all"); tabToday?.classList.toggle("active", boardPeriod === "today"); }
    function isMine(row: Row): boolean { return !!lastSubmit && row.initials === lastSubmit.initials && row.score === lastSubmit.score; }
    function renderBoard(top: Row[]): void {
        boardList.innerHTML = "";
        if (!top || top.length === 0) { const li = document.createElement("li"); li.className = "empty"; li.textContent = boardPeriod === "today" ? "No slayers tonight — yet." : "No souls tallied yet. Be the first."; boardList.appendChild(li); return; }
        let mineShown = false;
        top.forEach(function (row) {
            const li = document.createElement("li");
            if (!mineShown && isMine(row)) { li.className = "you"; mineShown = true; }
            const r = document.createElement("span"); r.className = "r"; r.textContent = "#" + row.rank;
            const i = document.createElement("span"); i.className = "i"; i.textContent = row.initials;
            const s = document.createElement("span"); s.className = "s"; s.textContent = Number(row.score).toLocaleString();
            li.append(r, i, s); boardList.appendChild(li);
        });
    }
    tabAll?.addEventListener("click", () => { loadBoard("all"); });
    tabToday?.addEventListener("click", () => { loadBoard("today"); });

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
})();
