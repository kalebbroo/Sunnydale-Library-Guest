"use strict";
/*
 * Stake Night — tunables, enemy/stage data, and sprite-sheet definitions.
 * Pure data plus stage() (the current-stage accessor). No runtime side effects at load.
 */
var SN;
(function (SN) {
    // ---- Tunables ---------------------------------------------------------
    SN.CONFIG = {
        floorTopFrac: 0.56, floorDepthFrac: 0.34, camLerp: 7,
        moveSpeed: 250, depthScale: 0.62, gravity: 2600, jumpVel: 720, coyoteMs: 90, jumpBufferMs: 120,
        attackCooldownMs: 300, attackMs: 160, attackReachX: 66, attackBandZ: 28, iframesMs: 1100,
        startLives: 3, maxLives: 5, baseKillPoints: 120,
        spawnStartMs: 1300, spawnMinMs: 550, spawnRampMs: 60000, maxEnemies: 12,
        pickupEveryMs: 14000, crossbowMs: 8000, boltSpeed: 700, holyRadius: 220,
        bossSpeed: 95, bossDashSpeed: 430,
        scytheMs: 9000, scytheReachMult: 1.8,
        throwCooldownMs: 600, throwSpeed: 760,
        knockImpulse: 460, knockFriction: 5, stunMs: 280, // harder hits, longer slide
        // Enemy melee: hold at standoff in x, align in z, then telegraph + strike. Damage lands
        // only on the active frame, so the wind-up is a real dodge window.
        enemyStandoff: 46, enemyAttackRangeX: 60, enemyAttackBandZ: 22, enemyActiveMs: 120,
        maxAttackers: 2, // attack tokens: how many vamps may swing at once
        enemySeparation: 26, // gentle push-apart so they don't stack on one spot
        // Player getting hit: i-frames (above) + a shove + a brief loss of control. Heavy hits
        // (brute/boss/thrown) shove harder and lock control longer (a "knockdown").
        playerKnock: 300, hitstunMs: 300, heavyHitKnock: 430, knockdownMs: 620,
        hitStopMs: 60, // freeze-frames on a landed hit (juice)
        // Combo finisher: every Nth connected melee hit launches survivors into a knockdown.
        finisherEvery: 3, chainWindowMs: 1200, finisherHitStopMs: 110,
        // Knockdown physics: pop up, arc under gravity, slide, lie, then get up.
        downPop: 360, downKnock: 540, downLieMs: 650, getupMs: 360, downAirDrag: 1.2, downGroundFriction: 9,
        // Jump attack: a downward strike with a wider band, and a pogo bounce on a clean hit.
        jumpAtkReachX: 72, jumpAtkBandZ: 40, jumpAtkBounce: 430,
        // Grab/throw: get close to a downed/stunned vamp to grab; throw it as a body projectile.
        grabRangeX: 40, grabRangeZ: 22, grabHoldMs: 1400, throwSpeedX: 560, throwPop: 300, throwDamage: 1,
        // Wall bounce: a knocked-down vamp that hits a screen edge reflects + takes bonus damage.
        wallBounceDamage: 1, wallBounceVx: 0.55,
        // Enemy guard: chance a capable vamp raises a block when the player winds up an attack.
        guardHoldMs: 520,
        flawlessBonus: 1500, // cleared a stage without taking a hit
        bgPar: { sky: 0.15, mid: 0.45, near: 1.0 }, // parallax factors for painted bg layers
        exitWalk: 440, // how far east to walk through an opened exit
    };
    SN.LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    // Buffy-flavored one-liners. Finisher quips float up on a combo finisher; the over-screen
    // flavor lines vary the game-over card.
    SN.FINISHER_QUIPS = ["Mr. Pointy says hi.", "That'll leave a mark.", "Welcome to the Hellmouth.", "Dust to dust.", "Class dismissed.", "Have we met?"];
    SN.OVER_QUIPS = {
        win: ["Sunnydale sleeps. For now.", "One girl in all the world — and she won.", "The Hellmouth holds.", "Knowledge is the highest good."],
        loss: ["\"The Earth is doomed.\" — Giles", "Tomorrow you might be dead.", "The Master rises…", "Sunrise is hours away."],
    };
    SN.ENEMY_TYPES = {
        grunt: { hp: 2, w: 30, h: 62, speed: 80, points: 120, color: "#1c1430", weight: () => 1.0, windup: 380, recover: 520, knock: 300, guard: 0 },
        runner: { hp: 1, w: 26, h: 56, speed: 150, points: 160, color: "#3a1330", weight: t => Math.max(0, t - 0.1) * 1.3, windup: 240, recover: 360, knock: 260, guard: 0 },
        brute: { hp: 4, w: 46, h: 78, speed: 55, points: 380, color: "#0f1a14", weight: t => Math.max(0, t - 0.25) * 0.9, windup: 600, recover: 760, knock: 470, guard: 0.4 },
    };
    // ---- Stages (data-driven scenes; last one is the boss) ----------------
    SN.STAGES = [
        { name: "Restfield Cemetery", quota: 6, waves: [3, 3], bg: "cemetery", palette: { sky0: "#0b0a14", sky1: "#241a30", floor0: "#2a2440", floor1: "#15101f", grave: "#161020" },
            story: "\"In every generation there is a Chosen One. She alone will stand against the vampires, the demons, and the forces of darkness. She is the Slayer.\"\nPatrol's on — clear the fledglings prowling Restfield." },
        { name: "The Crypt", quota: 8, waves: [4, 4], bg: "crypt", palette: { sky0: "#0a0f14", sky1: "#16242a", floor0: "#223036", floor1: "#0e1418", grave: "#0d1a1f" },
            story: "Down into the crypt. Colder here, and something's been feeding well — the Order of Aurelius marks its own." },
        { name: "Sunnydale High Halls", quota: 10, waves: [3, 3, 4], bg: "halls", levelUp: true, palette: { sky0: "#14100a", sky1: "#2a2014", floor0: "#3a2f1f", floor1: "#1a140c", grave: "#241a10" },
            story: "Back at school after dark. Giles left your locker open — Kendra's lucky stake, Mr. Pointy.\nLEVEL UP: press THROW (L) to hurl it!" },
        { name: "The Library", quota: 12, waves: [4, 4, 4], bg: "library", palette: { sky0: "#0e0a14", sky1: "#241a30", floor0: "#2e2640", floor1: "#16101f", grave: "#1a1428" },
            story: "The library sits right over the Hellmouth — an octagonal room, a red line on the floor, and the Seal of Danzalthar breathing below. They're pouring out. Hold the line." },
        { name: "The Master's Lair", quota: 0, boss: true, bg: "lair", palette: { sky0: "#160608", sky1: "#2a0c10", floor0: "#2a1014", floor1: "#120608", grave: "#1c0a0c" },
            story: "Heinrich Joseph Nest. The Master. Oldest vampire on record — and tonight he wants the Harvest. The Codex says he kills you, Slayer. Prove it wrong." },
    ];
    function stage() { return SN.STAGES[Math.max(0, Math.min(SN.state.stageIndex, SN.STAGES.length - 1))]; }
    SN.stage = stage;
    // ---- Sprite sheets (see SPRITES.md) -----------------------------------
    // Animation rows. Actors share rows 0-3; the player adds rows 4-8 for the richer move set
    // (jump, knockdown, throw, block, victory) and enemies add a knockdown row. Each entry is
    // { row index, frame count, playback fps, loops }. The loader reads frame f of row r from the
    // pixel rect (f·fw, r·fh, fw, fh). Names here are the strings code assigns to actor.anim.
    SN.PLAYER_ANIMS = {
        idle: { row: 0, frames: 4, fps: 6, loop: true },
        walk: { row: 1, frames: 6, fps: 12, loop: true },
        attack: { row: 2, frames: 4, fps: 18, loop: false },
        hurt: { row: 3, frames: 2, fps: 10, loop: false },
        jump: { row: 4, frames: 3, fps: 10, loop: false },
        knockdown: { row: 5, frames: 4, fps: 8, loop: false },
        throw: { row: 6, frames: 3, fps: 14, loop: false },
        block: { row: 7, frames: 2, fps: 12, loop: false },
        victory: { row: 8, frames: 3, fps: 6, loop: false },
    };
    SN.ENEMY_ANIMS = {
        idle: { row: 0, frames: 4, fps: 6, loop: true },
        walk: { row: 1, frames: 6, fps: 12, loop: true },
        attack: { row: 2, frames: 4, fps: 16, loop: false },
        hurt: { row: 3, frames: 2, fps: 10, loop: false },
        knockdown: { row: 4, frames: 4, fps: 8, loop: false },
    };
    SN.BOSS_ANIMS = {
        idle: { row: 0, frames: 4, fps: 6, loop: true },
        walk: { row: 1, frames: 6, fps: 12, loop: true },
        attack: { row: 2, frames: 4, fps: 16, loop: false },
        hurt: { row: 3, frames: 2, fps: 10, loop: false },
    };
    // The sheets the loader fetches. Until a PNG exists the actor draws procedurally (drawSheet
    // returns false), so art can ship one file at a time. fw/fh is the source cell; `scale` sizes
    // it on screen (≈ a head taller than the hitbox). `smooth: true` keeps painterly/HD source art
    // crisp when scaled down — set false for true pixel art.
    SN.SHEETS = {
        buffy: { src: "/img/buffy.png", fw: 96, fh: 128, scale: 0.75, smooth: true, anims: SN.PLAYER_ANIMS },
        grunt: { src: "/img/vamp_grunt.png", fw: 80, fh: 112, scale: 0.75, smooth: true, anims: SN.ENEMY_ANIMS },
        runner: { src: "/img/vamp_runner.png", fw: 80, fh: 112, scale: 0.75, smooth: true, anims: SN.ENEMY_ANIMS },
        brute: { src: "/img/vamp_brute.png", fw: 112, fh: 144, scale: 0.78, smooth: true, anims: SN.ENEMY_ANIMS },
        boss: { src: "/img/master.png", fw: 144, fh: 176, scale: 0.80, smooth: true, anims: SN.BOSS_ANIMS },
    };
})(SN || (SN = {}));
/*
 * Stake Night — canvas, viewport, the frame clock, and the world→screen projection.
 *
 * Coordinates: x = world horizontal, z = floor depth (0 far/top … floorDepth() near/bottom),
 * y = jump height. screenX = x - camX; screenY = floorTopY + z - y.
 */
var SN;
(function (SN) {
    SN.canvas = document.getElementById("game-canvas");
    SN.ctx = SN.canvas.getContext("2d");
    SN.viewW = 0, SN.viewH = 0, SN.dpr = 1;
    SN.nowMs = 0;
    function resize() {
        SN.dpr = Math.min(window.devicePixelRatio || 1, 2);
        SN.viewW = SN.canvas.clientWidth || window.innerWidth;
        SN.viewH = SN.canvas.clientHeight || window.innerHeight;
        SN.canvas.width = Math.round(SN.viewW * SN.dpr);
        SN.canvas.height = Math.round(SN.viewH * SN.dpr);
        SN.ctx.setTransform(SN.dpr, 0, 0, SN.dpr, 0, 0);
        if (SN.ctx) {
            SN.ctx.imageSmoothingEnabled = false;
        }
    }
    SN.resize = resize;
    window.addEventListener("resize", resize);
    function floorTopY() { return SN.viewH * SN.CONFIG.floorTopFrac; }
    SN.floorTopY = floorTopY;
    function floorDepth() { return SN.viewH * SN.CONFIG.floorDepthFrac; }
    SN.floorDepth = floorDepth;
    function sx(x) { return x - SN.state.camX; }
    SN.sx = sx;
    function groundY(z) { return floorTopY() + z; }
    SN.groundY = groundY;
    function feetY(z, y) { return floorTopY() + z - y; }
    SN.feetY = feetY;
})(SN || (SN = {}));
/*
 * Stake Night — Web Audio sound effects and a tiny synth bassline. No asset files; every
 * sound is generated. Tolerates browsers with no AudioContext (stays silent).
 */
var SN;
(function (SN) {
    SN.Sound = (function () {
        const ACtor = window.AudioContext
            || window.webkitAudioContext;
        let ctxA = null;
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
            if (ctxA || !ACtor) {
                return;
            }
            try {
                ctxA = new ACtor();
                master = ctxA.createGain();
                master.gain.value = muted ? 0 : 0.5;
                master.connect(ctxA.destination);
            }
            catch {
                ctxA = null;
                master = null;
            }
        }
        function resume() { ensure(); if (ctxA && ctxA.state === "suspended") {
            ctxA.resume().catch(() => { });
        } }
        function blip(f0, f1, dur, type, vol) {
            if (!ctxA || !master || muted) {
                return;
            }
            const t = ctxA.currentTime;
            const o = ctxA.createOscillator();
            const g = ctxA.createGain();
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
        function burst(dur, vol) {
            if (!ctxA || !master || muted) {
                return;
            }
            const t = ctxA.currentTime;
            const n = Math.max(1, Math.floor(ctxA.sampleRate * dur));
            const buf = ctxA.createBuffer(1, n, ctxA.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < n; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / n);
            }
            const src = ctxA.createBufferSource();
            src.buffer = buf;
            const g = ctxA.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            const hp = ctxA.createBiquadFilter();
            hp.type = "highpass";
            hp.frequency.value = 700;
            src.connect(hp);
            hp.connect(g);
            g.connect(master);
            src.start(t);
            src.stop(t + dur + 0.02);
        }
        const sfx = {
            hit() { burst(0.09, 0.5); blip(420, 90, 0.10, "square", 0.18); },
            finisher() { burst(0.14, 0.5); blip(300, 70, 0.20, "sawtooth", 0.3); blip(160, 60, 0.24, "square", 0.16); },
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
        function startMusic() {
            if (!ctxA || musicId) {
                return;
            }
            musicStep = 0;
            musicId = setInterval(function () {
                if (!ctxA || muted) {
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
        function toggleMute() { muted = !muted; writeMuted(muted); if (master) {
            master.gain.value = muted ? 0 : 0.5;
        } return muted; }
        function isMuted() { return muted; }
        return { resume, sfx, startMusic, stopMusic, toggleMute, isMuted };
    })();
})(SN || (SN = {}));
/*
 * Stake Night — sprite-sheet loader and frame blitter. drawSheet() returns false when a sheet
 * isn't ready, so callers fall back to procedural shapes (see render.ts). See SPRITES.md.
 */
var SN;
(function (SN) {
    SN.sheets = {};
    function loadSheets() {
        if (typeof Image === "undefined") {
            return;
        }
        for (const key of Object.keys(SN.SHEETS)) {
            const def = SN.SHEETS[key];
            const stt = { def, img: null, ready: false };
            try {
                const img = new Image();
                img.onload = () => { stt.img = img; stt.ready = true; };
                img.onerror = () => { stt.ready = false; };
                img.src = def.src;
            }
            catch { /* ignore */ }
            SN.sheets[key] = stt;
        }
    }
    SN.loadSheets = loadSheets;
    // ---- Background layers ------------------------------------------------
    // Per-stage parallax PNGs at /img/bg_<prefix>_{sky,mid,near}.png. Until they exist the layers
    // stay un-ready and render() falls back to the procedural palette. See SPRITES.md §2.
    SN.bgSets = {};
    function bgLayer(src, par) {
        const L = { img: null, ready: false, par };
        if (typeof Image !== "undefined") {
            try {
                const img = new Image();
                img.onload = () => { L.img = img; L.ready = true; };
                img.onerror = () => { L.ready = false; };
                img.src = src;
            }
            catch { /* ignore */ }
        }
        return L;
    }
    function loadBg(prefix) {
        if (SN.bgSets[prefix]) {
            return SN.bgSets[prefix];
        }
        const set = {
            sky: bgLayer("/img/bg_" + prefix + "_sky.png", SN.CONFIG.bgPar.sky),
            mid: bgLayer("/img/bg_" + prefix + "_mid.png", SN.CONFIG.bgPar.mid),
            near: bgLayer("/img/bg_" + prefix + "_near.png", SN.CONFIG.bgPar.near),
        };
        SN.bgSets[prefix] = set;
        return set;
    }
    SN.loadBg = loadBg;
    function drawSheet(kind, anim, animStart, fxp, fyp, facing) {
        const stt = SN.sheets[kind];
        if (!stt || !stt.ready || !stt.img) {
            return false;
        }
        const def = stt.def;
        const a = def.anims[anim] || def.anims.idle;
        let frame = Math.floor(((SN.nowMs - animStart) / 1000) * a.fps);
        frame = a.loop ? frame % a.frames : Math.min(frame, a.frames - 1);
        const w = def.fw * def.scale, h = def.fh * def.scale;
        SN.ctx.save();
        SN.ctx.imageSmoothingEnabled = def.smooth !== false; // HD/painterly sheets scale cleanly; restored by ctx.restore()
        SN.ctx.translate(fxp, fyp);
        SN.ctx.scale(facing, 1);
        SN.ctx.drawImage(stt.img, frame * def.fw, a.row * def.fh, def.fw, def.fh, -w / 2, -h, w, h);
        SN.ctx.restore();
        return true;
    }
    SN.drawSheet = drawSheet;
})(SN || (SN = {}));
/*
 * Stake Night — the mutable game state and its fresh-start factories, plus the parallax
 * background seeding (stars + gravestones) sized to the current viewport.
 */
var SN;
(function (SN) {
    SN.projHitId = -1;
    function freshPlayer() {
        return {
            x: 0, z: SN.floorDepth() * 0.5, y: 0, vy: 0, w: 30, h: 64, facing: 1, moving: false,
            onGround: true, lastGroundMs: 0, attackUntil: -1e9, lastAttackMs: -1e9, hurtUntil: -1e9,
            hitstunUntil: -1e9, knockVx: 0, knockVz: 0, chain: 0, chainAt: -1e9, grabbing: null, grabUntil: -1e9,
            crossbowUntil: -1e9, scytheUntil: -1e9, canThrow: false, lastThrowMs: -1e9,
            lives: SN.CONFIG.startLives, anim: "idle", animStart: 0,
        };
    }
    SN.freshPlayer = freshPlayer;
    function freshState() {
        return {
            running: false, phase: "playing", score: 0, combo: 0, bestCombo: 0, elapsed: 0,
            stageIndex: 0, spawnedThisStage: 0, defeatedThisStage: 0,
            exitOpen: false, exitX: 0, bossSpawned: false, victory: false,
            tookDamageThisStage: false, arenaLocked: false, arenaLockX: 0, nextWaveAtX: 0, waveIndex: 0,
            spawnTimer: 700, pickupTimer: SN.CONFIG.pickupEveryMs, camX: 0, attackId: 0, flash: 0, hitStop: 0,
            player: freshPlayer(), enemies: [], pickups: [], bolts: [], dust: [], stars: [], graves: [],
            boss: null, popups: [], banner: null, shake: 0, runToken: null,
        };
    }
    SN.freshState = freshState;
    function seedBackground() {
        SN.state.stars = [];
        const count = Math.round((SN.viewW * SN.floorTopY()) / 9000);
        for (let i = 0; i < count; i++) {
            SN.state.stars.push({ x: Math.random() * SN.viewW, y: Math.random() * SN.floorTopY() * 0.9, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2, par: 0.2 + Math.random() * 0.2 });
        }
        SN.state.graves = [];
        const graveCount = Math.max(6, Math.round(SN.viewW / 120));
        for (let i = 0; i < graveCount * 3; i++) {
            SN.state.graves.push({ x: (i - graveCount) * 150 + Math.random() * 90, w: 30 + Math.random() * 26, h: 40 + Math.random() * 34, par: 0.5 });
        }
    }
    SN.seedBackground = seedBackground;
})(SN || (SN = {}));
/*
 * Stake Night — keyboard + touch input. Holds the directional state and wires the on-screen
 * buttons. tryAttack/tryThrow (combat.ts) are invoked lazily so file order doesn't matter.
 */
var SN;
(function (SN) {
    SN.input = { left: false, right: false, up: false, down: false, jumpBufferedAt: -1e9 };
    SN.held = new Set();
    function pressJump() { SN.input.jumpBufferedAt = SN.nowMs; }
    SN.pressJump = pressJump;
    function syncDirs() {
        SN.input.left = SN.held.has("arrowleft") || SN.held.has("a");
        SN.input.right = SN.held.has("arrowright") || SN.held.has("d");
        SN.input.up = SN.held.has("arrowup") || SN.held.has("w");
        SN.input.down = SN.held.has("arrowdown") || SN.held.has("s");
    }
    SN.syncDirs = syncDirs;
    function keyDown(e) {
        const k = e.key.toLowerCase();
        if (["arrowleft", "a", "arrowright", "d", "arrowup", "w", "arrowdown", "s"].includes(k)) {
            SN.held.add(k);
            syncDirs();
            e.preventDefault();
        }
        else if (k === " " || k === "spacebar" || k === "j" || k === "x" || k === "enter" || e.code === "Space") {
            SN.tryAttack();
            e.preventDefault();
        }
        else if (k === "k" || k === "shift") {
            pressJump();
            e.preventDefault();
        }
        else if (k === "l" || k === ";") {
            SN.tryThrow();
            e.preventDefault();
        }
    }
    SN.keyDown = keyDown;
    function keyUp(e) { SN.held.delete(e.key.toLowerCase()); syncDirs(); }
    SN.keyUp = keyUp;
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
    SN.bindHold = bindHold;
    function bindTap(el, fn) {
        if (!el) {
            return;
        }
        el.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); }, { passive: false });
    }
    SN.bindTap = bindTap;
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    SN.canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); SN.tryAttack(); }, { passive: false });
    bindHold(document.getElementById("btn-left"), v => { SN.input.left = v; });
    bindHold(document.getElementById("btn-right"), v => { SN.input.right = v; });
    bindHold(document.getElementById("btn-up"), v => { SN.input.up = v; });
    bindHold(document.getElementById("btn-down"), v => { SN.input.down = v; });
    bindTap(document.getElementById("btn-attack"), () => SN.tryAttack());
    bindTap(document.getElementById("btn-jump"), pressJump);
    bindTap(document.getElementById("btn-throw"), () => SN.tryThrow());
})(SN || (SN = {}));
/*
 * Stake Night — difficulty ramp, weighted enemy spawning, pickup drops, and boss entrance.
 */
var SN;
(function (SN) {
    function difficultyT() { return Math.min(1, SN.state.elapsed / SN.CONFIG.spawnRampMs); }
    SN.difficultyT = difficultyT;
    function pickEnemyType() {
        const t = difficultyT();
        const entries = Object.entries(SN.ENEMY_TYPES).map(([k, v]) => [k, Math.max(0, v.weight(t))]);
        const total = entries.reduce((s, [, w]) => s + w, 0);
        let r = Math.random() * total;
        for (const [k, w] of entries) {
            if ((r -= w) <= 0) {
                return k;
            }
        }
        return "grunt";
    }
    SN.pickEnemyType = pickEnemyType;
    function spawnEnemy() {
        if (SN.state.enemies.length >= SN.CONFIG.maxEnemies) {
            return;
        }
        const typeKey = pickEnemyType();
        const def = SN.ENEMY_TYPES[typeKey];
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = side > 0 ? SN.state.camX + SN.viewW + 50 : SN.state.camX - 50;
        SN.state.enemies.push({
            type: typeKey, x, z: Math.random() * SN.floorDepth(), y: 0, vy: 0, vx: 0, vz: 0, stunUntil: -1e9,
            w: def.w, h: def.h, hp: def.hp, def, wobble: Math.random() * Math.PI * 2,
            contactUntil: -1e9, hitBy: -1, alive: true, anim: "walk", animStart: SN.nowMs,
            phase: "chase", phaseUntil: -1e9, grabbed: false, bounced: false,
        });
        SN.state.spawnedThisStage++;
    }
    SN.spawnEnemy = spawnEnemy;
    function spawnPickup() {
        const roll = Math.random();
        const type = roll < 0.16 ? "heart" : roll < 0.46 ? "crossbow" : roll < 0.73 ? "scythe" : "holy";
        SN.state.pickups.push({ type, x: SN.state.player.x + SN.state.player.facing * (200 + Math.random() * 240), z: Math.random() * SN.floorDepth(), bob: Math.random() * Math.PI * 2, born: SN.nowMs });
    }
    SN.spawnPickup = spawnPickup;
    function spawnBoss() {
        const hp = 26;
        SN.state.boss = {
            x: SN.state.camX + SN.viewW + 80, z: SN.floorDepth() * 0.5, y: 0, w: 60, h: 96, hp, maxHp: hp,
            nextDashAt: SN.nowMs + 1800, dashUntil: -1e9, dashVx: 0, dashVz: 0, contactUntil: -1e9, hitBy: -1,
        };
        SN.state.bossSpawned = true;
        SN.Sound.sfx.bossIn();
    }
    SN.spawnBoss = spawnBoss;
})(SN || (SN = {}));
/*
 * Stake Night — attacks, throws, projectile fire, knockback, damage resolution (enemies, boss,
 * player), pickups, and the dust/score-popup particle spawners.
 */
var SN;
(function (SN) {
    function tryAttack() {
        if (!SN.state || !SN.state.running) {
            return;
        }
        const p = SN.state.player;
        if (SN.nowMs < p.hitstunUntil) {
            return;
        } // can't attack while knocked back
        if (p.grabbing) {
            throwGrabbed();
            return;
        } // HIT while holding a vamp → throw it
        if (SN.nowMs - p.lastAttackMs < SN.CONFIG.attackCooldownMs) {
            return;
        }
        p.lastAttackMs = SN.nowMs;
        p.attackUntil = SN.nowMs + SN.CONFIG.attackMs;
        SN.state.attackId++;
        if (SN.nowMs < p.crossbowUntil) {
            p.anim = "attack";
            p.animStart = SN.nowMs;
            fire("bolt");
            SN.Sound.sfx.shoot();
            return;
        }
        // On the ground next to a downed/stunned vamp? Grab it instead of swinging.
        if (p.onGround && tryGrab()) {
            return;
        }
        const airborne = !p.onGround;
        if (SN.nowMs - p.chainAt > SN.CONFIG.chainWindowMs) {
            p.chain = 0;
        } // stale chain resets
        const finisher = ((p.chain + 1) % SN.CONFIG.finisherEvery) === 0; // every Nth connected hit
        p.anim = airborne ? "jump" : "attack";
        p.animStart = SN.nowMs;
        const scythe = SN.nowMs < p.scytheUntil;
        let reach = scythe ? SN.CONFIG.attackReachX * SN.CONFIG.scytheReachMult : SN.CONFIG.attackReachX;
        let band = scythe ? SN.CONFIG.attackBandZ * 1.6 : SN.CONFIG.attackBandZ;
        if (airborne) {
            reach = Math.max(reach, SN.CONFIG.jumpAtkReachX);
            band = Math.max(band, SN.CONFIG.jumpAtkBandZ);
        } // jump attack: wider, downward
        const cx = p.x + p.facing * (reach * 0.5 + p.w * 0.5);
        let hitAny = false;
        for (const e of SN.state.enemies) {
            if (!e.alive || e.hitBy === SN.state.attackId) {
                continue;
            }
            if (Math.abs(e.x - cx) < reach * 0.5 + e.w * 0.5 && Math.abs(e.z - p.z) < band && (e.x - p.x) * p.facing > -8) {
                // A finisher, jump attack, or scythe breaks a guard; a plain hit does not.
                if (hitEnemy(e, SN.state.attackId, scythe, finisher, finisher || airborne || scythe)) {
                    hitAny = true;
                }
            }
        }
        if (SN.state.boss) {
            const b = SN.state.boss;
            if (Math.abs(b.x - cx) < reach * 0.5 + b.w * 0.5 && Math.abs(b.z - p.z) < band + 10 && (b.x - p.x) * p.facing > -8 && b.hitBy !== SN.state.attackId) {
                b.hitBy = SN.state.attackId;
                damageBoss(scythe ? 3 : 1);
                hitAny = true;
            }
        }
        if (hitAny) {
            p.chain++;
            p.chainAt = SN.nowMs;
            if (finisher) {
                SN.Sound.sfx.finisher();
                SN.state.shake = Math.max(SN.state.shake, 8);
                spawnPopup(p.x, SN.feetY(p.z, 0) - p.h - 22, SN.FINISHER_QUIPS[Math.floor(Math.random() * SN.FINISHER_QUIPS.length)]);
            }
            if (airborne) {
                p.vy = SN.CONFIG.jumpAtkBounce;
                p.onGround = false;
            } // pogo off the hit
        }
        else {
            SN.state.combo = 0;
            p.chain = 0;
            SN.Sound.sfx.whiff();
            SN.updateHud();
        }
    }
    SN.tryAttack = tryAttack;
    // ---- Grab & throw -----------------------------------------------------
    // Grab the nearest downed/stunned vamp in front of the player; returns true if one was grabbed.
    function tryGrab() {
        const p = SN.state.player;
        let best = null, bestDx = 1e9;
        for (const e of SN.state.enemies) {
            if (!e.alive || e.grabbed) {
                continue;
            }
            const grabbable = e.phase === "down" || e.phase === "getup" || SN.nowMs < e.stunUntil;
            if (!grabbable) {
                continue;
            }
            const dx = e.x - p.x;
            if (Math.abs(dx) < SN.CONFIG.grabRangeX + e.w * 0.5 && Math.abs(e.z - p.z) < SN.CONFIG.grabRangeZ && dx * p.facing > -10 && Math.abs(dx) < bestDx) {
                best = e;
                bestDx = Math.abs(dx);
            }
        }
        if (!best) {
            return false;
        }
        best.grabbed = true;
        best.phase = "chase";
        best.vx = 0;
        best.vy = 0;
        best.y = 0;
        best.stunUntil = -1e9;
        p.grabbing = best;
        p.grabUntil = SN.nowMs + SN.CONFIG.grabHoldMs;
        p.anim = "throw";
        p.animStart = SN.nowMs;
        SN.Sound.sfx.pickup();
        return true;
    }
    SN.tryGrab = tryGrab;
    function throwGrabbed() {
        const p = SN.state.player;
        const e = p.grabbing;
        if (!e) {
            return;
        }
        p.grabbing = null;
        p.anim = "throw";
        p.animStart = SN.nowMs;
        p.lastAttackMs = SN.nowMs;
        p.attackUntil = SN.nowMs + SN.CONFIG.attackMs;
        e.grabbed = false;
        e.phase = "thrown";
        e.bounced = false;
        e.hitBy = SN.projHitId--;
        e.vx = p.facing * SN.CONFIG.throwSpeedX;
        e.vy = SN.CONFIG.throwPop;
        e.y = e.h * 0.4;
        e.anim = "knockdown";
        e.animStart = SN.nowMs;
        SN.state.shake = Math.max(SN.state.shake, 6);
        SN.Sound.sfx.shoot();
    }
    SN.throwGrabbed = throwGrabbed;
    function tryThrow() {
        if (!SN.state || !SN.state.running) {
            return;
        }
        const p = SN.state.player;
        if (!p.canThrow || SN.nowMs - p.lastThrowMs < SN.CONFIG.throwCooldownMs) {
            return;
        }
        p.lastThrowMs = SN.nowMs;
        p.attackUntil = SN.nowMs + SN.CONFIG.attackMs;
        p.anim = "throw";
        p.animStart = SN.nowMs;
        fire("stake");
        SN.Sound.sfx.shoot();
        if (Math.random() < 0.34) {
            spawnPopup(p.x, SN.feetY(p.z, 0) - p.h - 18, "Mr. Pointy!");
        }
    }
    SN.tryThrow = tryThrow;
    function fire(kind) {
        const p = SN.state.player;
        const speed = kind === "stake" ? SN.CONFIG.throwSpeed : SN.CONFIG.boltSpeed;
        SN.state.bolts.push({ kind, x: p.x + p.facing * 18, z: p.z, y: p.h * 0.55, vx: p.facing * speed, spin: 0, alive: true });
    }
    SN.fire = fire;
    function knockback(e, lethal, finisher = false) {
        const p = SN.state.player;
        const dirx = (Math.sign(e.x - p.x) || p.facing);
        const resist = e.type === "brute" ? 0.45 : 1;
        if (finisher && !lethal) {
            // Finisher launches a surviving vamp into a knockdown (pop + arc + slide + lie + getup).
            e.phase = "down";
            e.phaseUntil = SN.nowMs + SN.CONFIG.downLieMs;
            e.bounced = false;
            e.vx = dirx * SN.CONFIG.downKnock * resist;
            e.vy = SN.CONFIG.downPop * (e.type === "brute" ? 0.7 : 1);
            e.vz = 0;
            e.anim = "knockdown";
            e.animStart = SN.nowMs;
            e.stunUntil = -1e9;
        }
        else {
            e.vx = dirx * SN.CONFIG.knockImpulse * resist * (lethal ? 1.5 : 1);
            e.vz = (e.z - p.z >= 0 ? 1 : -1) * 40 * resist;
            e.stunUntil = SN.nowMs + SN.CONFIG.stunMs;
        }
    }
    SN.knockback = knockback;
    // Returns true if the hit connected (false if a guard absorbed it — that shouldn't advance the
    // player's combo). `breakGuard` (finisher / jump-attack / scythe) smashes through a block.
    function hitEnemy(e, attackId, lethal = false, finisher = false, breakGuard = false) {
        e.hitBy = attackId;
        if (e.phase === "block" && !breakGuard) {
            // Guarded: no damage, a spark, and a little shove for both.
            const dirx = Math.sign(e.x - SN.state.player.x) || SN.state.player.facing;
            e.x += dirx * 6;
            e.phaseUntil = Math.max(e.phaseUntil, SN.nowMs + 120);
            spawnDust(e.x - dirx * e.w * 0.4, SN.feetY(e.z, 0) - e.h * 0.6, 4, "#cfe8ff");
            SN.Sound.sfx.whiff();
            return false;
        }
        SN.Sound.sfx.hit(); // connects (incl. a broken guard)
        SN.state.hitStop = Math.max(SN.state.hitStop, finisher ? SN.CONFIG.finisherHitStopMs : SN.CONFIG.hitStopMs);
        if (e.phase === "windup" || e.phase === "active" || e.phase === "recover" || e.phase === "block") {
            e.phase = "chase";
            e.phaseUntil = SN.nowMs + 220;
        }
        if (lethal) {
            e.hp = 1;
        }
        e.hp--;
        const dead = e.hp <= 0;
        knockback(e, dead, finisher);
        if (!dead) {
            if (e.phase !== "down") {
                spawnDust(e.x, SN.feetY(e.z, 0) - e.h * 0.5, 6, "#8a6a9a");
                e.anim = "hurt";
                e.animStart = SN.nowMs;
            }
            return true;
        }
        e.alive = false;
        SN.state.defeatedThisStage++;
        SN.state.combo++;
        SN.state.bestCombo = Math.max(SN.state.bestCombo, SN.state.combo);
        const gained = Math.round(e.def.points * (1 + Math.floor(SN.state.combo / 5) * 0.5));
        SN.state.score += gained;
        spawnDust(e.x, SN.feetY(e.z, 0) - e.h * 0.5, 16, "#c9b8d6");
        spawnPopup(e.x, SN.feetY(e.z, 0) - e.h, "+" + gained);
        SN.updateHud();
        return true;
    }
    SN.hitEnemy = hitEnemy;
    function damageBoss(n) {
        const b = SN.state.boss;
        if (!b) {
            return;
        }
        b.hp -= n;
        spawnDust(b.x, SN.feetY(b.z, 0) - b.h * 0.5, 8, "#ff7b7b");
        if (b.hp <= 0) {
            SN.state.score += 2500;
            SN.state.combo += 5;
            spawnDust(b.x, SN.feetY(b.z, 0) - b.h * 0.5, 40, "#f4ecc6");
            spawnPopup(b.x, SN.feetY(b.z, 0) - b.h, "+2500");
            SN.state.flash = 0.9;
            SN.state.shake = Math.max(SN.state.shake, 18);
            SN.state.hitStop = Math.max(SN.state.hitStop, 140);
            SN.Sound.sfx.bossDown();
            SN.state.boss = null;
            SN.endGame(true); // boss only exists on the finale stage → victory
        }
        SN.updateHud();
    }
    SN.damageBoss = damageBoss;
    // Called only when an enemy/boss strike actually lands. i-frames (iframesMs) make the player
    // invulnerable for ~1s afterwards; hitstun briefly takes control away and shoves them back,
    // away from the attacker — TMNT/Streets-of-Rage style.
    function hurtPlayer(srcX, srcZ, power = SN.CONFIG.playerKnock) {
        const p = SN.state.player;
        if (SN.nowMs < p.hurtUntil) {
            return;
        } // still invulnerable from the last hit
        const heavy = power >= SN.CONFIG.heavyHitKnock; // brute / boss / thrown body → knockdown
        p.hurtUntil = SN.nowMs + SN.CONFIG.iframesMs;
        p.hitstunUntil = SN.nowMs + (heavy ? SN.CONFIG.knockdownMs : SN.CONFIG.hitstunMs);
        p.lives--;
        SN.state.combo = 0;
        p.chain = 0;
        SN.state.tookDamageThisStage = true;
        if (p.grabbing) {
            p.grabbing.grabbed = false;
            p.grabbing.phase = "chase";
            p.grabbing = null;
        } // drop the grab
        const dirX = srcX != null ? (Math.sign(p.x - srcX) || -p.facing) : -p.facing;
        p.knockVx = dirX * power;
        p.knockVz = srcZ != null ? (Math.sign(p.z - srcZ) || 0) * power * 0.4 : 0;
        if (heavy) {
            p.vy = SN.CONFIG.throwPop;
            p.onGround = false;
        } // a little pop sells the knockdown
        p.anim = heavy ? "knockdown" : "hurt";
        p.animStart = SN.nowMs;
        SN.state.flash = Math.max(SN.state.flash, heavy ? 0.55 : 0.4);
        SN.state.shake = Math.max(SN.state.shake, heavy ? 13 : 9);
        SN.state.hitStop = Math.max(SN.state.hitStop, heavy ? 90 : SN.CONFIG.hitStopMs);
        SN.Sound.sfx.hurt();
        SN.updateHud();
        if (p.lives <= 0) {
            SN.endGame(false);
        }
    }
    SN.hurtPlayer = hurtPlayer;
    function spawnDust(x, screenYy, n, color) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 140;
            SN.state.dust.push({ x, y: screenYy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0, max: 0.45 + Math.random() * 0.4, color: color || "#c9b8d6" });
        }
    }
    SN.spawnDust = spawnDust;
    function spawnPopup(x, screenYy, text) { SN.state.popups.push({ x, y: screenYy, text, life: 0, max: 0.8, vy: -60 }); }
    SN.spawnPopup = spawnPopup;
    function applyPickup(pk) {
        const p = SN.state.player;
        if (pk.type === "heart") {
            p.lives = Math.min(SN.CONFIG.maxLives, p.lives + 1);
        }
        else if (pk.type === "crossbow") {
            p.crossbowUntil = SN.nowMs + SN.CONFIG.crossbowMs;
        }
        else if (pk.type === "scythe") {
            p.scytheUntil = SN.nowMs + SN.CONFIG.scytheMs;
        }
        else if (pk.type === "holy") {
            SN.state.flash = 0.7;
            for (const e of SN.state.enemies) {
                if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < SN.CONFIG.holyRadius) {
                    e.alive = false;
                    SN.state.defeatedThisStage++;
                    SN.state.score += Math.round(e.def.points * 0.5);
                    spawnDust(e.x, SN.feetY(e.z, 0) - e.h * 0.5, 14, "#f4ecc6");
                }
            }
        }
        SN.Sound.sfx.pickup();
        SN.updateHud();
    }
    SN.applyPickup = applyPickup;
})(SN || (SN = {}));
/*
 * Stake Night — the per-frame simulation: player movement/jump, camera, spawning cadence,
 * enemy AI + contact, projectiles, pickups, particles, the boss, and the stage-clear flow.
 */
var SN;
(function (SN) {
    // ---- Wave gating ------------------------------------------------------
    // A combat stage is split into arenas: the camera locks, a wave of vamps spawns, and the
    // player can't push east until it's cleared. Falls back to a single wave of `quota`.
    function effectiveWaves(s) { return (s.waves && s.waves.length) ? s.waves : [s.quota]; }
    SN.effectiveWaves = effectiveWaves;
    function waveCumQuota(s, i) { const w = effectiveWaves(s); let n = 0; for (let k = 0; k <= i && k < w.length; k++) {
        n += w[k];
    } return n; }
    SN.waveCumQuota = waveCumQuota;
    function startWave(i) {
        SN.state.waveIndex = i;
        SN.state.arenaLocked = true;
        SN.state.arenaLockX = SN.state.camX;
        SN.state.spawnTimer = 400;
    }
    SN.startWave = startWave;
    function update(dt) {
        SN.state.elapsed += dt * 1000;
        const p = SN.state.player;
        if (SN.nowMs < p.hitstunUntil) {
            // Knocked back and briefly out of control after a hit.
            p.x += p.knockVx * dt;
            p.z += p.knockVz * dt;
            const kf = Math.min(1, SN.CONFIG.knockFriction * dt);
            p.knockVx -= p.knockVx * kf;
            p.knockVz -= p.knockVz * kf;
            p.z = Math.max(0, Math.min(SN.floorDepth(), p.z));
            p.moving = false;
        }
        else {
            const dirX = (SN.input.right ? 1 : 0) - (SN.input.left ? 1 : 0);
            const dirZ = (SN.input.down ? 1 : 0) - (SN.input.up ? 1 : 0);
            p.x += dirX * SN.CONFIG.moveSpeed * dt;
            p.z += dirZ * SN.CONFIG.moveSpeed * SN.CONFIG.depthScale * dt;
            p.z = Math.max(0, Math.min(SN.floorDepth(), p.z));
            if (dirX !== 0) {
                p.facing = dirX;
            }
            p.moving = (dirX !== 0 || dirZ !== 0);
            const canCoyote = p.onGround || (SN.nowMs - p.lastGroundMs) < SN.CONFIG.coyoteMs;
            if (SN.nowMs - SN.input.jumpBufferedAt < SN.CONFIG.jumpBufferMs && canCoyote) {
                p.vy = SN.CONFIG.jumpVel;
                p.onGround = false;
                SN.input.jumpBufferedAt = -1e9;
                p.lastGroundMs = -1e9;
                SN.Sound.sfx.jump();
            }
        }
        p.vy -= SN.CONFIG.gravity * dt;
        p.y += p.vy * dt;
        p.onGround = false;
        if (p.y <= 0) {
            p.y = 0;
            p.vy = 0;
            p.onGround = true;
            p.lastGroundMs = SN.nowMs;
        }
        // While an arena is locked, the player can't walk off the right (or left) of the screen.
        if (SN.state.arenaLocked) {
            const margin = p.w * 1.2;
            p.x = Math.max(SN.state.arenaLockX + margin, Math.min(SN.state.arenaLockX + SN.viewW - margin, p.x));
        }
        // Animation: attack holds until attackUntil; hurt/knockdown holds through hitstun (set by
        // hurtPlayer); otherwise resolve to walk/idle.
        if (SN.nowMs >= p.attackUntil && SN.nowMs >= p.hitstunUntil) {
            const want = p.moving ? "walk" : "idle";
            if (p.anim !== want) {
                p.anim = want;
                p.animStart = SN.nowMs;
            }
        }
        // Camera holds at the lock line while an arena is active, else follows the player east.
        if (SN.state.arenaLocked) {
            SN.state.camX += (SN.state.arenaLockX - SN.state.camX) * Math.min(1, SN.CONFIG.camLerp * dt);
        }
        else {
            SN.state.camX += (p.x - SN.viewW * 0.5 - SN.state.camX) * Math.min(1, SN.CONFIG.camLerp * dt);
        }
        // Spawn the current wave's vamps (only while its arena is locked).
        if (SN.state.phase === "playing" && !SN.stage().boss && SN.state.arenaLocked && SN.state.spawnedThisStage < waveCumQuota(SN.stage(), SN.state.waveIndex)) {
            SN.state.spawnTimer -= dt * 1000;
            if (SN.state.spawnTimer <= 0) {
                SN.spawnEnemy();
                SN.state.spawnTimer = SN.CONFIG.spawnStartMs + (SN.CONFIG.spawnMinMs - SN.CONFIG.spawnStartMs) * SN.difficultyT();
            }
        }
        SN.state.pickupTimer -= dt * 1000;
        if (SN.state.pickupTimer <= 0) {
            SN.spawnPickup();
            SN.state.pickupTimer = SN.CONFIG.pickupEveryMs;
        }
        // Enemies: grabbed bodies and knockdown/thrown arcs first, else the attack state machine —
        // chase to standoff, telegraph a wind-up, strike, recover; capable vamps may raise a guard.
        // Touching the player never damages; only a landed strike does (the wind-up is a dodge window).
        let attackers = 0;
        for (const e of SN.state.enemies) {
            if (e.alive && (e.phase === "windup" || e.phase === "active")) {
                attackers++;
            }
        }
        for (const e of SN.state.enemies) {
            if (!e.alive) {
                continue;
            }
            if (e.grabbed) { // held just in front of the player until thrown or the hold lapses
                const hold = p.x + p.facing * (p.w * 0.5 + e.w * 0.5 + 4);
                e.x += (hold - e.x) * Math.min(1, 18 * dt);
                e.z = p.z;
                e.y = e.h * 0.25;
                e.wobble += dt * 4;
                if (SN.nowMs >= p.grabUntil) {
                    e.grabbed = false;
                    e.phase = "chase";
                    e.y = 0;
                    if (p.grabbing === e) {
                        p.grabbing = null;
                    }
                }
                continue;
            }
            if (e.phase === "down" || e.phase === "getup" || e.phase === "thrown") {
                updateDownedEnemy(e, dt);
                continue;
            }
            if (SN.nowMs < e.stunUntil) {
                e.x += e.vx * dt;
                e.z += e.vz * dt;
                const f = Math.min(1, SN.CONFIG.knockFriction * dt);
                e.vx -= e.vx * f;
                e.vz -= e.vz * f;
                e.z = Math.max(0, Math.min(SN.floorDepth(), e.z));
                continue;
            }
            const dx = p.x - e.x, dz = p.z - e.z;
            const adx = Math.abs(dx), adz = Math.abs(dz);
            e.wobble += dt * 6;
            if (e.phase === "block") {
                if (SN.nowMs >= e.phaseUntil) {
                    e.phase = "chase";
                }
            }
            else if (e.phase === "chase") {
                const aligned = adx < SN.CONFIG.enemyAttackRangeX && adz < SN.CONFIG.enemyAttackBandZ;
                if (e.def.guard > 0 && aligned && SN.nowMs > e.phaseUntil && Math.random() < e.def.guard * dt * 1.2) {
                    e.phase = "block";
                    e.phaseUntil = SN.nowMs + SN.CONFIG.guardHoldMs;
                    e.anim = "block";
                    e.animStart = SN.nowMs; // raise a guard
                }
                else if (aligned && SN.nowMs > e.phaseUntil && attackers < SN.CONFIG.maxAttackers) {
                    e.phase = "windup";
                    e.phaseUntil = SN.nowMs + e.def.windup;
                    attackers++;
                    e.anim = "attack";
                    e.animStart = SN.nowMs;
                }
                else {
                    // Close in along x only until standoff, and align in z — keeps them spaced
                    // around the player instead of body-blocking on one point.
                    if (adx > SN.CONFIG.enemyStandoff) {
                        e.x += Math.sign(dx) * e.def.speed * dt;
                    }
                    if (adz > 2) {
                        e.z += Math.sign(dz) * e.def.speed * SN.CONFIG.depthScale * dt;
                    }
                    if (e.anim !== "walk") {
                        e.anim = "walk";
                        e.animStart = SN.nowMs;
                    }
                }
            }
            else if (e.phase === "windup") {
                if (SN.nowMs >= e.phaseUntil) {
                    // The strike resolves now; a small lunge sells it. Damage only if the player
                    // is still in reach (they had the whole wind-up to step out) and not airborne.
                    e.x += Math.sign(dx || 1) * 6;
                    if (adx < SN.CONFIG.enemyAttackRangeX + e.w * 0.4 && adz < SN.CONFIG.enemyAttackBandZ && p.y < 42) {
                        SN.hurtPlayer(e.x, e.z, e.def.knock);
                    }
                    else {
                        SN.Sound.sfx.whiff();
                    }
                    e.phase = "active";
                    e.phaseUntil = SN.nowMs + SN.CONFIG.enemyActiveMs;
                }
            }
            else if (e.phase === "active") {
                if (SN.nowMs >= e.phaseUntil) {
                    e.phase = "recover";
                    e.phaseUntil = SN.nowMs + e.def.recover;
                    e.anim = "idle";
                    e.animStart = SN.nowMs;
                }
            }
            else { // recover
                if (SN.nowMs >= e.phaseUntil) {
                    e.phase = "chase";
                }
            }
        }
        // Gentle separation along z so vamps fan out instead of stacking (skip busy/airborne ones).
        for (const e of SN.state.enemies) {
            if (!e.alive || e.grabbed || SN.nowMs < e.stunUntil || e.phase === "windup" || e.phase === "active" || e.phase === "down" || e.phase === "getup" || e.phase === "thrown") {
                continue;
            }
            for (const o of SN.state.enemies) {
                if (o === e || !o.alive) {
                    continue;
                }
                if (Math.abs(e.x - o.x) < SN.CONFIG.enemySeparation && Math.abs(e.z - o.z) < SN.CONFIG.enemySeparation * 0.7) {
                    e.z += (Math.sign(e.z - o.z) || 1) * (SN.CONFIG.enemySeparation - Math.abs(e.z - o.z)) * dt * 3;
                    e.z = Math.max(0, Math.min(SN.floorDepth(), e.z));
                }
            }
        }
        SN.state.enemies = SN.state.enemies.filter(e => e.alive);
        if (SN.state.boss) {
            updateBoss(dt);
        }
        // Bolts / thrown stakes.
        for (const b of SN.state.bolts) {
            b.x += b.vx * dt;
            b.spin += dt * 18;
            for (const e of SN.state.enemies) {
                if (e.alive && Math.abs(e.x - b.x) < e.w * 0.6 && Math.abs(e.z - b.z) < 22) {
                    SN.hitEnemy(e, SN.projHitId--);
                    b.alive = false;
                    break;
                }
            }
            if (b.alive && SN.state.boss && Math.abs(SN.state.boss.x - b.x) < SN.state.boss.w * 0.6 && Math.abs(SN.state.boss.z - b.z) < 26) {
                SN.damageBoss(1);
                b.alive = false;
            }
            if (Math.abs(b.x - p.x) > SN.viewW) {
                b.alive = false;
            }
        }
        SN.state.bolts = SN.state.bolts.filter(b => b.alive);
        for (const pk of SN.state.pickups) {
            pk.bob += dt * 4;
            if (Math.abs(pk.x - p.x) < 28 && Math.abs(pk.z - p.z) < 24) {
                pk.taken = true;
                SN.applyPickup(pk);
            }
        }
        SN.state.pickups = SN.state.pickups.filter(pk => !pk.taken && Math.abs(pk.x - p.x) < SN.viewW * 1.4 && SN.nowMs - pk.born < 20000);
        for (const d of SN.state.dust) {
            d.life += dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.vy += 220 * dt;
        }
        SN.state.dust = SN.state.dust.filter(d => d.life < d.max);
        for (const pop of SN.state.popups) {
            pop.life += dt;
            pop.y += pop.vy * dt;
            pop.vy += 40 * dt;
        }
        SN.state.popups = SN.state.popups.filter(pop => pop.life < pop.max);
        if (SN.state.flash > 0) {
            SN.state.flash = Math.max(0, SN.state.flash - dt * 2);
        }
        if (SN.state.shake > 0) {
            SN.state.shake = Math.max(0, SN.state.shake - dt * 40);
        }
        if (SN.state.banner && SN.nowMs > SN.state.banner.until) {
            SN.state.banner = null;
        }
        const powerActive = SN.nowMs < p.crossbowUntil || SN.nowMs < p.scytheUntil;
        if (powerActive) {
            p._wasPower = true;
            SN.updateHud();
        }
        else if (p._wasPower) {
            p._wasPower = false;
            SN.updateHud();
        }
        // --- Stage flow: wave gating → clear arena → push east to the next wave → exit ---
        const s = SN.stage();
        if (SN.state.phase === "playing" && !s.boss) {
            const waveTarget = waveCumQuota(s, SN.state.waveIndex);
            const last = SN.state.waveIndex >= effectiveWaves(s).length - 1;
            const cleared = SN.state.defeatedThisStage >= waveTarget && SN.state.enemies.length === 0;
            if (SN.state.arenaLocked && cleared) {
                if (last) {
                    SN.state.exitOpen = true;
                    SN.state.exitX = p.x + SN.CONFIG.exitWalk;
                    SN.state.arenaLocked = false;
                    if (!SN.state.tookDamageThisStage) {
                        SN.state.score += SN.CONFIG.flawlessBonus;
                        SN.spawnPopup(p.x, SN.feetY(p.z, 0) - p.h - 16, "FLAWLESS +" + SN.CONFIG.flawlessBonus);
                        SN.state.banner = { text: "FLAWLESS!  +" + SN.CONFIG.flawlessBonus + " — head east →", until: SN.nowMs + 4500 };
                        SN.Sound.sfx.levelup();
                    }
                    else {
                        SN.state.banner = { text: "Cleared — head east →", until: SN.nowMs + 4000 };
                    }
                    SN.state.phase = "cleared";
                    SN.updateHud();
                }
                else {
                    SN.state.arenaLocked = false;
                    SN.state.nextWaveAtX = SN.state.arenaLockX + SN.viewW * 0.72;
                    SN.state.banner = { text: "Wave clear — push east →", until: SN.nowMs + 3000 };
                    SN.updateHud();
                }
            }
            else if (!SN.state.arenaLocked && !SN.state.exitOpen && SN.state.defeatedThisStage >= waveTarget && p.x >= SN.state.nextWaveAtX) {
                startWave(SN.state.waveIndex + 1);
                SN.state.banner = { text: "Wave " + (SN.state.waveIndex + 1) + " of " + effectiveWaves(s).length, until: SN.nowMs + 1800 };
                SN.Sound.sfx.stage();
                SN.updateHud();
            }
        }
        if (SN.state.phase === "cleared" && p.x >= SN.state.exitX) {
            SN.advanceStage();
        }
    }
    SN.update = update;
    // A knocked-down or thrown vamp: arc under gravity, slide, bounce off screen edges; a thrown
    // body ploughs through other vamps (knocking them down too). Settles into "down" → "getup" → chase.
    function updateDownedEnemy(e, dt) {
        e.x += e.vx * dt;
        e.vy -= SN.CONFIG.gravity * dt;
        e.y = e.y + e.vy * dt;
        const grounded = e.y <= 0;
        if (grounded) {
            e.y = 0;
            e.vy = 0;
            const gf = Math.min(1, SN.CONFIG.downGroundFriction * dt);
            e.vx -= e.vx * gf;
        }
        else {
            const af = Math.min(1, SN.CONFIG.downAirDrag * dt);
            e.vx -= e.vx * af;
        }
        e.z = Math.max(0, Math.min(SN.floorDepth(), e.z));
        wallBounce(e);
        if (e.phase === "thrown") {
            for (const o of SN.state.enemies) {
                if (o === e || !o.alive || o.grabbed || o.phase === "thrown") {
                    continue;
                }
                if (Math.abs(o.x - e.x) < (o.w + e.w) * 0.5 && Math.abs(o.z - e.z) < 22) {
                    SN.hitEnemy(o, SN.projHitId--, false, true, true);
                }
            }
            if (SN.state.boss && Math.abs(SN.state.boss.x - e.x) < (SN.state.boss.w + e.w) * 0.5 && Math.abs(SN.state.boss.z - e.z) < 26) {
                SN.damageBoss(SN.CONFIG.throwDamage);
                e.bounced = true;
            }
            if (grounded && Math.abs(e.vx) < 40) {
                e.phase = "down";
                e.phaseUntil = SN.nowMs + SN.CONFIG.downLieMs;
            }
            return;
        }
        if (e.phase === "down" && grounded && SN.nowMs >= e.phaseUntil && Math.abs(e.vx) < 28) {
            e.phase = "getup";
            e.phaseUntil = SN.nowMs + SN.CONFIG.getupMs;
            e.anim = "knockdown";
            e.animStart = SN.nowMs;
        }
        else if (e.phase === "getup" && SN.nowMs >= e.phaseUntil) {
            e.phase = "chase";
            e.stunUntil = -1e9;
        }
    }
    SN.updateDownedEnemy = updateDownedEnemy;
    // Reflect a knocked-down/thrown vamp off the camera's screen edges — once per knockdown — for a
    // splash of bonus damage. Classic "bounce them off the wall" payoff.
    function wallBounce(e) {
        if (e.bounced) {
            return;
        }
        const leftEdge = SN.state.camX + e.w * 0.5, rightEdge = SN.state.camX + SN.viewW - e.w * 0.5;
        if ((e.x < leftEdge && e.vx < 0) || (e.x > rightEdge && e.vx > 0)) {
            e.x = Math.max(leftEdge, Math.min(rightEdge, e.x));
            e.vx = -e.vx * SN.CONFIG.wallBounceVx;
            e.bounced = true;
            SN.spawnDust(e.x, SN.feetY(e.z, e.y) - e.h * 0.4, 10, "#cfe8ff");
            SN.state.shake = Math.max(SN.state.shake, 6);
            SN.Sound.sfx.hit();
            e.hp -= SN.CONFIG.wallBounceDamage;
            if (e.hp <= 0) {
                e.alive = false;
                SN.state.defeatedThisStage++;
                SN.state.combo++;
                SN.state.bestCombo = Math.max(SN.state.bestCombo, SN.state.combo);
                SN.state.score += Math.round(e.def.points * 0.6);
                SN.spawnPopup(e.x, SN.feetY(e.z, 0) - e.h, "WALL!");
                SN.spawnDust(e.x, SN.feetY(e.z, 0) - e.h * 0.5, 16, "#c9b8d6");
                SN.updateHud();
            }
        }
    }
    SN.wallBounce = wallBounce;
    function updateBoss(dt) {
        const b = SN.state.boss;
        if (!b) {
            return;
        }
        const p = SN.state.player;
        if (SN.nowMs < b.dashUntil) {
            b.x += b.dashVx * dt;
            b.z += b.dashVz * dt;
        }
        else {
            const dx = p.x - b.x, dz = p.z - b.z, dist = Math.hypot(dx, dz) || 1;
            b.x += (dx / dist) * SN.CONFIG.bossSpeed * dt;
            b.z += (dz / dist) * SN.CONFIG.bossSpeed * SN.CONFIG.depthScale * dt;
            if (SN.nowMs >= b.nextDashAt) {
                b.dashUntil = SN.nowMs + 380;
                b.dashVx = (dx / dist) * SN.CONFIG.bossDashSpeed;
                b.dashVz = (dz / dist) * SN.CONFIG.bossDashSpeed * SN.CONFIG.depthScale;
                b.nextDashAt = SN.nowMs + 2200;
            }
        }
        b.z = Math.max(0, Math.min(SN.floorDepth(), b.z));
        if (Math.abs(b.x - p.x) < (b.w + p.w) * 0.5 && Math.abs(b.z - p.z) < 24 && SN.nowMs > b.contactUntil) {
            b.contactUntil = SN.nowMs + 800;
            SN.hurtPlayer(b.x, b.z, SN.CONFIG.playerKnock * 1.6);
        }
    }
    SN.updateBoss = updateBoss;
})(SN || (SN = {}));
/*
 * Stake Night — the whole frame: parallax sky/stars/moon/graves, the depth-sorted actor pass,
 * projectiles, particles, score popups, the EXIT arrow, and screen flash/banner. Actor draws
 * use sprite sheets when loaded (drawSheet) and fall back to procedural shapes otherwise.
 */
var SN;
(function (SN) {
    // Draw the stage's painted parallax layers (sky → mid → near), each tiled and scrolled by its
    // parallax factor. Returns false if the stage has no bg or its layers aren't all loaded yet.
    function drawBgLayers() {
        const s = SN.stage();
        if (!s.bg) {
            return false;
        }
        const set = SN.loadBg(s.bg);
        if (!set.sky.ready || !set.mid.ready || !set.near.ready) {
            return false;
        }
        drawBgLayer(set.sky);
        drawBgLayer(set.mid);
        drawBgLayer(set.near);
        return true;
    }
    SN.drawBgLayers = drawBgLayers;
    function drawBgLayer(L) {
        const img = L.img;
        if (!img) {
            return;
        }
        const scale = SN.viewH / img.height;
        const w = Math.max(1, img.width * scale);
        let x = -(((SN.state.camX * L.par) % w + w) % w); // seamless horizontal tiling
        for (; x < SN.viewW; x += w) {
            SN.ctx.drawImage(img, 0, 0, img.width, img.height, x, 0, w, SN.viewH);
        }
    }
    function render() {
        const ftY = SN.floorTopY();
        const pal = SN.stage().palette;
        const OS = 26;
        const shx = SN.state.shake > 0 ? (Math.random() * 2 - 1) * SN.state.shake : 0;
        const shy = SN.state.shake > 0 ? (Math.random() * 2 - 1) * SN.state.shake : 0;
        SN.ctx.save();
        SN.ctx.translate(shx, shy);
        // Painted parallax layers if this stage's PNGs are loaded; otherwise the procedural scene.
        if (!drawBgLayers()) {
            const sky = SN.ctx.createLinearGradient(0, 0, 0, ftY);
            sky.addColorStop(0, pal.sky0);
            sky.addColorStop(1, pal.sky1);
            SN.ctx.fillStyle = sky;
            SN.ctx.fillRect(-OS, -OS, SN.viewW + OS * 2, ftY + OS);
            for (const s of SN.state.stars) {
                const px = ((s.x - SN.state.camX * s.par) % SN.viewW + SN.viewW) % SN.viewW;
                SN.ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw + SN.nowMs / 600));
                SN.ctx.fillStyle = "#fdf6d8";
                SN.ctx.beginPath();
                SN.ctx.arc(px, s.y, s.r, 0, Math.PI * 2);
                SN.ctx.fill();
            }
            SN.ctx.globalAlpha = 1;
            SN.ctx.fillStyle = "#f4ecc6";
            SN.ctx.beginPath();
            SN.ctx.arc(SN.viewW * 0.8, ftY * 0.26, 34, 0, Math.PI * 2);
            SN.ctx.fill();
            SN.ctx.fillStyle = "rgba(11,10,20,0.55)";
            SN.ctx.beginPath();
            SN.ctx.arc(SN.viewW * 0.8 + 12, ftY * 0.26 - 6, 30, 0, Math.PI * 2);
            SN.ctx.fill();
            SN.ctx.fillStyle = pal.grave;
            for (const g of SN.state.graves) {
                const gx = g.x - SN.state.camX * g.par;
                const px = ((gx % (SN.viewW + 400)) + (SN.viewW + 400)) % (SN.viewW + 400) - 200;
                SN.ctx.beginPath();
                SN.ctx.moveTo(px - g.w / 2, ftY);
                SN.ctx.lineTo(px - g.w / 2, ftY - g.h * 0.55);
                SN.ctx.arc(px, ftY - g.h * 0.55, g.w / 2, Math.PI, 0);
                SN.ctx.lineTo(px + g.w / 2, ftY);
                SN.ctx.closePath();
                SN.ctx.fill();
            }
            const floor = SN.ctx.createLinearGradient(0, ftY, 0, ftY + SN.floorDepth());
            floor.addColorStop(0, pal.floor0);
            floor.addColorStop(1, pal.floor1);
            SN.ctx.fillStyle = floor;
            SN.ctx.fillRect(-OS, ftY, SN.viewW + OS * 2, SN.floorDepth() + OS);
            SN.ctx.strokeStyle = "rgba(255,255,255,0.06)";
            SN.ctx.beginPath();
            SN.ctx.moveTo(0, ftY);
            SN.ctx.lineTo(SN.viewW, ftY);
            SN.ctx.stroke();
        }
        SN.ctx.fillStyle = "rgba(0,0,0,0.28)";
        const shadow = (x, z, w) => { SN.ctx.beginPath(); SN.ctx.ellipse(SN.sx(x), SN.groundY(z), w * 0.5, w * 0.22, 0, 0, Math.PI * 2); SN.ctx.fill(); };
        for (const e of SN.state.enemies) {
            if (e.alive) {
                shadow(e.x, e.z, e.w);
            }
        }
        for (const pk of SN.state.pickups) {
            shadow(pk.x, pk.z, 22);
        }
        if (SN.state.boss) {
            shadow(SN.state.boss.x, SN.state.boss.z, SN.state.boss.w);
        }
        shadow(SN.state.player.x, SN.state.player.z, SN.state.player.w);
        const list = [];
        for (const e of SN.state.enemies) {
            if (e.alive) {
                list.push({ z: e.z, render: () => drawEnemy(e) });
            }
        }
        for (const pk of SN.state.pickups) {
            list.push({ z: pk.z, render: () => drawPickup(pk) });
        }
        if (SN.state.boss) {
            const b = SN.state.boss;
            list.push({ z: b.z, render: () => drawBoss(b) });
        }
        list.push({ z: SN.state.player.z, render: drawBuffy });
        list.sort((a, b) => a.z - b.z);
        for (const d of list) {
            d.render();
        }
        // Projectiles.
        for (const b of SN.state.bolts) {
            const bx = SN.sx(b.x), by = SN.feetY(b.z, b.y);
            if (b.kind === "stake") {
                SN.ctx.save();
                SN.ctx.translate(bx, by);
                SN.ctx.rotate(b.spin);
                SN.ctx.fillStyle = "#8a5a2b";
                SN.ctx.fillRect(-9, -2, 18, 4);
                SN.ctx.fillStyle = "#d9b27a";
                SN.ctx.fillRect(6, -2, 3, 4);
                SN.ctx.restore();
            }
            else {
                SN.ctx.fillStyle = "#e8c659";
                SN.ctx.fillRect(bx - 8, by - 1.5, 16, 3);
            }
        }
        for (const d of SN.state.dust) {
            const k = 1 - d.life / d.max;
            SN.ctx.globalAlpha = Math.max(0, k);
            SN.ctx.fillStyle = d.color;
            SN.ctx.beginPath();
            SN.ctx.arc(SN.sx(d.x), d.y, 2 + k * 3, 0, Math.PI * 2);
            SN.ctx.fill();
        }
        SN.ctx.globalAlpha = 1;
        SN.ctx.font = "bold 16px Georgia, serif";
        SN.ctx.textAlign = "center";
        SN.ctx.textBaseline = "middle";
        for (const pop of SN.state.popups) {
            SN.ctx.globalAlpha = Math.max(0, 1 - pop.life / pop.max);
            SN.ctx.fillStyle = "#f4ecc6";
            SN.ctx.fillText(pop.text, SN.sx(pop.x), pop.y);
        }
        SN.ctx.globalAlpha = 1;
        // EXIT arrow (when a scene is cleared).
        if (SN.state.exitOpen) {
            const ax = SN.viewW - 60, ay = ftY + SN.floorDepth() * 0.45, pulse = 0.6 + 0.4 * Math.sin(SN.nowMs / 200);
            SN.ctx.globalAlpha = pulse;
            SN.ctx.fillStyle = "#e8c659";
            SN.ctx.beginPath();
            SN.ctx.moveTo(ax - 24, ay - 18);
            SN.ctx.lineTo(ax + 10, ay);
            SN.ctx.lineTo(ax - 24, ay + 18);
            SN.ctx.closePath();
            SN.ctx.fill();
            SN.ctx.fillRect(ax - 44, ay - 7, 22, 14);
            SN.ctx.globalAlpha = 1;
            SN.ctx.fillStyle = "#e8c659";
            SN.ctx.font = "bold 13px Georgia, serif";
            SN.ctx.textAlign = "center";
            SN.ctx.fillText("EXIT", ax - 14, ay - 28);
        }
        SN.ctx.restore();
        if (SN.state.flash > 0) {
            SN.ctx.fillStyle = `rgba(255,240,220,${SN.state.flash * 0.5})`;
            SN.ctx.fillRect(0, 0, SN.viewW, SN.viewH);
        }
        if (SN.state.banner) {
            SN.ctx.globalAlpha = Math.min(1, (SN.state.banner.until - SN.nowMs) / 500);
            SN.ctx.fillStyle = "#ffd76b";
            SN.ctx.font = "italic bold 26px Georgia, serif";
            SN.ctx.textAlign = "center";
            SN.ctx.textBaseline = "middle";
            SN.ctx.fillText(SN.state.banner.text, SN.viewW / 2, SN.viewH * 0.26);
            SN.ctx.globalAlpha = 1;
        }
    }
    SN.render = render;
    function drawBuffy() {
        const p = SN.state.player;
        const fx = SN.sx(p.x), fy = SN.feetY(p.z, p.y);
        if (SN.drawSheet("buffy", p.anim, p.animStart, fx, fy, p.facing)) {
            return;
        }
        const lunging = SN.nowMs < p.attackUntil;
        const hurtBlink = SN.nowMs < p.hurtUntil && (Math.floor(SN.nowMs / 80) % 2 === 0);
        SN.ctx.save();
        SN.ctx.translate(fx, fy);
        SN.ctx.scale(p.facing, 1);
        if (hurtBlink) {
            SN.ctx.globalAlpha = 0.4;
        }
        SN.ctx.fillStyle = "#27313f";
        SN.ctx.fillRect(-9, -22, 18, 22);
        SN.ctx.fillStyle = "#7a2233";
        SN.ctx.fillRect(-9, -54, 18, 34);
        SN.ctx.fillStyle = "#f0c9a0";
        SN.ctx.beginPath();
        SN.ctx.arc(0, -62, 9, 0, Math.PI * 2);
        SN.ctx.fill();
        SN.ctx.fillStyle = "#e8c659";
        SN.ctx.beginPath();
        SN.ctx.arc(0, -64, 9.5, Math.PI, Math.PI * 2);
        SN.ctx.fill();
        SN.ctx.fillRect(-9.5, -64, 4, 12);
        SN.ctx.fillRect(5.5, -64, 4, 12);
        const reach = lunging ? 30 : 20;
        SN.ctx.strokeStyle = "#f0c9a0";
        SN.ctx.lineWidth = 4;
        SN.ctx.beginPath();
        SN.ctx.moveTo(6, -46);
        SN.ctx.lineTo(reach, -44);
        SN.ctx.stroke();
        if (SN.nowMs < p.crossbowUntil) {
            SN.ctx.strokeStyle = "#5a4632";
            SN.ctx.lineWidth = 6;
            SN.ctx.beginPath();
            SN.ctx.moveTo(reach, -48);
            SN.ctx.lineTo(reach + 4, -40);
            SN.ctx.stroke();
        }
        else if (SN.nowMs < p.scytheUntil) {
            const bl = reach + (lunging ? 32 : 26);
            SN.ctx.strokeStyle = "#6a5238";
            SN.ctx.lineWidth = 4;
            SN.ctx.beginPath();
            SN.ctx.moveTo(reach, -44);
            SN.ctx.lineTo(bl, -44);
            SN.ctx.stroke();
            SN.ctx.strokeStyle = "#c7ccd2";
            SN.ctx.lineWidth = 4;
            SN.ctx.beginPath();
            SN.ctx.moveTo(bl, -44);
            SN.ctx.quadraticCurveTo(bl + 6, -58, bl - 8, -60);
            SN.ctx.stroke();
        }
        else {
            SN.ctx.strokeStyle = "#8a5a2b";
            SN.ctx.lineWidth = 5;
            SN.ctx.beginPath();
            SN.ctx.moveTo(reach, -44);
            SN.ctx.lineTo(reach + (lunging ? 16 : 14), -44);
            SN.ctx.stroke();
        }
        SN.ctx.restore();
    }
    SN.drawBuffy = drawBuffy;
    function drawEnemy(e) {
        const facing = Math.sign(SN.state.player.x - e.x) || 1;
        const fx = SN.sx(e.x), fy = SN.feetY(e.z, e.y);
        if (SN.drawSheet(e.type, e.anim, e.animStart, fx, fy, facing)) {
            return;
        }
        const winding = e.phase === "windup";
        const striking = e.phase === "active";
        const blocking = e.phase === "block";
        const thrown = e.phase === "thrown";
        const downed = e.phase === "down" || e.phase === "getup";
        const bob = (winding || striking || blocking || downed || thrown) ? 0 : Math.sin(e.wobble) * 3;
        const lean = (winding ? -4 : striking ? 6 : 0) * facing; // cock back, then lunge in
        SN.ctx.save();
        SN.ctx.translate(fx + lean, fy + bob);
        if (thrown) {
            SN.ctx.rotate(e.wobble * 3);
        } // tumbling through the air
        else if (e.phase === "down") {
            SN.ctx.rotate(facing * 1.3);
        } // flat on the ground
        else if (e.phase === "getup") {
            SN.ctx.rotate(facing * 0.6);
        } // rising back up
        // Wind-up telegraph: a pulsing red aura + glowing eyes so the strike is readable/dodgeable.
        if (winding) {
            SN.ctx.globalAlpha = 0.3 + 0.35 * Math.abs(Math.sin(SN.nowMs / 60));
            SN.ctx.fillStyle = "#ff3b3b";
            SN.ctx.beginPath();
            SN.ctx.ellipse(0, -e.h * 0.5, e.w * 0.95, e.h * 0.58, 0, 0, Math.PI * 2);
            SN.ctx.fill();
            SN.ctx.globalAlpha = 1;
        }
        SN.ctx.fillStyle = "#0f0a1c";
        SN.ctx.fillRect(-e.w / 2, -22, e.w, 22);
        SN.ctx.fillStyle = e.def.color;
        SN.ctx.fillRect(-e.w / 2, -e.h + 10, e.w, e.h - 32);
        SN.ctx.fillStyle = "#b9a6c4";
        SN.ctx.beginPath();
        SN.ctx.arc(0, -e.h + 8, e.w * 0.34, 0, Math.PI * 2);
        SN.ctx.fill();
        SN.ctx.fillStyle = winding ? "#ffd23b" : "#ff3b3b";
        SN.ctx.fillRect(-5, -e.h + 6, 3, 3);
        SN.ctx.fillRect(2, -e.h + 6, 3, 3);
        if (blocking) {
            // Guard: a bluish forearm bracket raised in front — needs a finisher/jump/scythe to break.
            SN.ctx.save();
            SN.ctx.scale(facing, 1);
            SN.ctx.strokeStyle = "#bfe3ff";
            SN.ctx.lineWidth = 5;
            SN.ctx.beginPath();
            SN.ctx.moveTo(e.w * 0.16, -e.h * 0.78);
            SN.ctx.lineTo(e.w * 0.16, -e.h * 0.28);
            SN.ctx.stroke();
            SN.ctx.globalAlpha = 0.5;
            SN.ctx.beginPath();
            SN.ctx.arc(e.w * 0.16, -e.h * 0.5, 5, 0, Math.PI * 2);
            SN.ctx.stroke();
            SN.ctx.globalAlpha = 1;
            SN.ctx.restore();
        }
        else if (!downed && !thrown) {
            // Claw arm: cocked back on the wind-up, slashing forward on the strike frame.
            const reach = striking ? 22 : winding ? -6 : 8;
            SN.ctx.save();
            SN.ctx.scale(facing, 1);
            SN.ctx.strokeStyle = striking ? "#ff6b6b" : "#cdbcd6";
            SN.ctx.lineWidth = 4;
            SN.ctx.beginPath();
            SN.ctx.moveTo(e.w * 0.28, -e.h * 0.6);
            SN.ctx.lineTo(e.w * 0.28 + reach, -e.h * 0.6 + (striking ? 6 : 0));
            SN.ctx.stroke();
            SN.ctx.restore();
        }
        if (e.hp < e.def.hp && !downed && !thrown) {
            SN.ctx.fillStyle = "#7a2233";
            SN.ctx.fillRect(-e.w / 2, -e.h + 2, e.w * (e.hp / e.def.hp), 3);
        }
        SN.ctx.restore();
    }
    SN.drawEnemy = drawEnemy;
    function drawBoss(b) {
        const fx = SN.sx(b.x), fy = SN.feetY(b.z, b.y);
        if (SN.drawSheet("boss", "walk", SN.nowMs, fx, fy, Math.sign(SN.state.player.x - b.x) || 1)) {
            return;
        }
        SN.ctx.save();
        SN.ctx.translate(fx, fy);
        SN.ctx.fillStyle = "#0a0610";
        SN.ctx.fillRect(-b.w / 2, -b.h, b.w, b.h);
        SN.ctx.fillStyle = "#2a1030";
        SN.ctx.fillRect(-b.w / 2 + 4, -b.h + 6, b.w - 8, b.h - 30);
        SN.ctx.fillStyle = "#cdbcd6";
        SN.ctx.beginPath();
        SN.ctx.arc(0, -b.h + 16, 18, 0, Math.PI * 2);
        SN.ctx.fill();
        SN.ctx.fillStyle = "#ff2020";
        SN.ctx.fillRect(-9, -b.h + 12, 6, 6);
        SN.ctx.fillRect(3, -b.h + 12, 6, 6);
        SN.ctx.restore();
    }
    SN.drawBoss = drawBoss;
    function drawPickup(pk) {
        const x = SN.sx(pk.x), y = SN.feetY(pk.z, 0) - 18 + Math.sin(pk.bob) * 4;
        SN.ctx.save();
        SN.ctx.translate(x, y);
        SN.ctx.fillStyle = "rgba(232,198,89,0.18)";
        SN.ctx.beginPath();
        SN.ctx.arc(0, 0, 16, 0, Math.PI * 2);
        SN.ctx.fill();
        if (pk.type === "heart") {
            SN.ctx.fillStyle = "#c83b54";
            SN.ctx.font = "20px serif";
            SN.ctx.textAlign = "center";
            SN.ctx.textBaseline = "middle";
            SN.ctx.fillText("❤", 0, 1);
        }
        else if (pk.type === "crossbow") {
            SN.ctx.strokeStyle = "#e8c659";
            SN.ctx.lineWidth = 3;
            SN.ctx.beginPath();
            SN.ctx.moveTo(-8, -6);
            SN.ctx.lineTo(8, -6);
            SN.ctx.moveTo(0, -8);
            SN.ctx.lineTo(0, 8);
            SN.ctx.stroke();
        }
        else if (pk.type === "scythe") {
            SN.ctx.strokeStyle = "#6a5238";
            SN.ctx.lineWidth = 3;
            SN.ctx.beginPath();
            SN.ctx.moveTo(-2, 9);
            SN.ctx.lineTo(2, -9);
            SN.ctx.stroke();
            SN.ctx.strokeStyle = "#c7ccd2";
            SN.ctx.lineWidth = 3;
            SN.ctx.beginPath();
            SN.ctx.moveTo(2, -9);
            SN.ctx.quadraticCurveTo(-9, -9, -8, 0);
            SN.ctx.stroke();
        }
        else {
            SN.ctx.fillStyle = "#bfe3ff";
            SN.ctx.fillRect(-5, -8, 10, 14);
            SN.ctx.fillStyle = "#fff";
            SN.ctx.fillRect(-3, -11, 6, 4);
        }
        SN.ctx.restore();
    }
    SN.drawPickup = drawPickup;
})(SN || (SN = {}));
/*
 * Stake Night — the DOM HUD: score, combo, lives, active power-up timers, the stage label,
 * and the boss health bar. updateHud() is called whenever those values change.
 */
var SN;
(function (SN) {
    SN.hud = document.getElementById("hud");
    SN.hudScore = document.getElementById("hud-score");
    SN.hudCombo = document.getElementById("hud-combo");
    SN.hudLives = document.getElementById("hud-lives");
    SN.hudPower = document.getElementById("hud-power");
    SN.hudStage = document.getElementById("hud-stage");
    SN.bossBar = document.getElementById("boss-bar");
    SN.bossName = document.getElementById("boss-name");
    SN.bossFill = document.getElementById("boss-hp-fill");
    function updateHud() {
        SN.hudScore.textContent = SN.state.score.toString().padStart(6, "0");
        SN.hudCombo.textContent = SN.state.combo >= 2 ? ("x" + SN.state.combo) : "";
        let bar = "";
        for (let i = 0; i < SN.CONFIG.maxLives; i++) {
            bar += i < SN.state.player.lives ? "▮" : "▯";
        }
        SN.hudLives.textContent = bar;
        if (SN.hudPower) {
            const parts = [];
            const cb = SN.state.player.crossbowUntil - SN.nowMs;
            if (cb > 0) {
                parts.push("🏹 " + Math.ceil(cb / 1000));
            }
            const scy = SN.state.player.scytheUntil - SN.nowMs;
            if (scy > 0) {
                parts.push("⚔ " + Math.ceil(scy / 1000));
            }
            SN.hudPower.textContent = parts.join("  ");
        }
        if (SN.hudStage) {
            const s = SN.stage();
            const waves = SN.effectiveWaves(s);
            const waveTag = waves.length > 1 ? "  ·  Wave " + (SN.state.waveIndex + 1) + "/" + waves.length : "";
            SN.hudStage.textContent = s.boss ? s.name + " — BOSS"
                : SN.state.phase === "cleared" ? s.name + " — CLEAR →"
                    : s.name + "  " + Math.min(SN.state.defeatedThisStage, s.quota) + "/" + s.quota + waveTag;
        }
        if (SN.bossBar) {
            if (SN.state.boss) {
                SN.bossBar.classList.remove("hidden");
                if (SN.bossName) {
                    SN.bossName.textContent = "The Master — Order of Aurelius";
                }
                SN.bossFill.style.width = Math.max(0, (SN.state.boss.hp / SN.state.boss.maxHp) * 100) + "%";
            }
            else {
                SN.bossBar.classList.add("hidden");
            }
        }
    }
    SN.updateHud = updateHud;
})(SN || (SN = {}));
/*
 * Stake Night — the requestAnimationFrame loop, the stage story overlays, and the run
 * lifecycle: anti-cheat run token, entering/beginning stages, start, advance, and end.
 */
var SN;
(function (SN) {
    // ---- Loop -------------------------------------------------------------
    SN.rafId = 0, SN.lastTs = 0, SN.paused = false;
    function frame(ts) {
        if (!SN.state.running || SN.paused) {
            return;
        }
        if (!SN.lastTs) {
            SN.lastTs = ts;
        }
        SN.nowMs = ts;
        let dt = (ts - SN.lastTs) / 1000;
        SN.lastTs = ts;
        if (dt > 0.05) {
            dt = 0.05;
        }
        if (SN.state.hitStop > 0) {
            SN.state.hitStop -= dt * 1000;
        } // freeze-frame on impact: hold the sim, keep drawing
        else {
            SN.update(dt);
        }
        if (SN.state.running && !SN.paused) {
            SN.render();
            SN.rafId = requestAnimationFrame(frame);
        }
    }
    SN.frame = frame;
    // ---- Stage flow + lifecycle -------------------------------------------
    SN.overlayStart = document.getElementById("overlay-start");
    SN.overlayOver = document.getElementById("overlay-over");
    SN.overlayStory = document.getElementById("overlay-story");
    SN.storyTitle = document.getElementById("story-title");
    SN.storyText = document.getElementById("story-text");
    SN.controls = document.getElementById("controls");
    SN.btnThrow = document.getElementById("btn-throw");
    SN.storyContinue = null;
    function requestRunToken() {
        fetch("/api/run/start", { method: "POST" }).then(r => r.ok ? r.json() : null)
            .then((d) => { if (d && d.token && SN.state) {
            SN.state.runToken = d.token;
        } }).catch(() => { });
    }
    SN.requestRunToken = requestRunToken;
    function showStory(s, idx, onContinue) {
        cancelAnimationFrame(SN.rafId);
        SN.paused = true;
        SN.storyContinue = onContinue;
        if (SN.storyTitle) {
            SN.storyTitle.textContent = "Stage " + (idx + 1) + " · " + s.name;
        }
        if (SN.storyText) {
            SN.storyText.textContent = s.story;
        }
        if (SN.controls) {
            SN.controls.classList.add("hidden");
        }
        if (SN.overlayStory) {
            SN.overlayStory.classList.remove("hidden");
        }
    }
    SN.showStory = showStory;
    function continueStory() {
        const cb = SN.storyContinue;
        SN.storyContinue = null;
        if (SN.overlayStory) {
            SN.overlayStory.classList.add("hidden");
        }
        if (cb) {
            cb();
        }
    }
    SN.continueStory = continueStory;
    function enterStage(i) {
        SN.state.stageIndex = i;
        SN.state.spawnedThisStage = 0;
        SN.state.defeatedThisStage = 0;
        SN.state.exitOpen = false;
        SN.state.bossSpawned = false;
        SN.state.tookDamageThisStage = false;
        SN.state.player.grabbing = null;
        SN.state.waveIndex = 0;
        SN.state.arenaLocked = false;
        SN.state.enemies = [];
        SN.state.bolts = [];
        SN.state.pickups = [];
        SN.state.camX = SN.state.player.x - SN.viewW * 0.5;
        SN.seedBackground();
        const s = SN.STAGES[i];
        if (s.levelUp) {
            SN.state.player.canThrow = true;
            if (SN.btnThrow) {
                SN.btnThrow.classList.remove("hidden");
            }
            SN.Sound.sfx.levelup();
        }
        showStory(s, i, () => beginStage(s));
    }
    SN.enterStage = enterStage;
    function beginStage(s) {
        SN.state.phase = "playing";
        SN.state.spawnTimer = 500;
        if (s.boss) {
            SN.spawnBoss();
        }
        else {
            SN.startWave(0);
        }
        SN.state.banner = { text: s.name, until: SN.nowMs + 2200 };
        SN.Sound.sfx.stage();
        if (SN.controls) {
            SN.controls.classList.remove("hidden");
            SN.controls.setAttribute("aria-hidden", "false");
        }
        SN.updateHud();
        SN.paused = false;
        SN.lastTs = 0;
        SN.rafId = requestAnimationFrame(frame);
    }
    SN.beginStage = beginStage;
    // Best-effort: enter fullscreen + lock to landscape (works on Android Chrome; iOS Safari can't
    // lock, so the CSS #rotate-hint covers portrait there). Called from the Start tap — a user
    // gesture, which fullscreen requires. All failures are silent.
    function goLandscape() {
        const root = (document.getElementById("game-root") || document.documentElement);
        try {
            const req = root.requestFullscreen || root.webkitRequestFullscreen;
            if (req && !document.fullscreenElement) {
                const r = req.call(root);
                if (r && r.catch) {
                    r.catch(() => { });
                }
            }
        }
        catch { /* no fullscreen */ }
        try {
            const o = screen.orientation;
            if (o && o.lock) {
                const r = o.lock("landscape");
                if (r && r.catch) {
                    r.catch(() => { });
                }
            }
        }
        catch { /* unsupported */ }
    }
    SN.goLandscape = goLandscape;
    function startGame() {
        goLandscape();
        SN.resize();
        SN.Sound.resume();
        SN.Sound.startMusic();
        SN.state = SN.freshState();
        requestRunToken();
        SN.state.running = true;
        SN.held.clear();
        SN.input.left = SN.input.right = SN.input.up = SN.input.down = false;
        SN.input.jumpBufferedAt = -1e9;
        SN.overlayStart.classList.add("hidden");
        SN.overlayOver.classList.add("hidden");
        if (SN.btnThrow) {
            SN.btnThrow.classList.add("hidden");
        }
        SN.hud.setAttribute("aria-hidden", "false");
        SN.updateHud();
        enterStage(0);
    }
    SN.startGame = startGame;
    function advanceStage() {
        if (SN.state.stageIndex + 1 < SN.STAGES.length) {
            enterStage(SN.state.stageIndex + 1);
        }
    }
    SN.advanceStage = advanceStage;
    function endGame(victory) {
        SN.state.running = false;
        SN.state.victory = victory;
        cancelAnimationFrame(SN.rafId);
        SN.Sound.stopMusic();
        if (victory) {
            SN.Sound.sfx.win();
        }
        else {
            SN.Sound.sfx.over();
        }
        SN.render();
        if (SN.controls) {
            SN.controls.classList.add("hidden");
            SN.controls.setAttribute("aria-hidden", "true");
        }
        if (SN.bossBar) {
            SN.bossBar.classList.add("hidden");
        }
        SN.showGameOver(victory);
    }
    SN.endGame = endGame;
})(SN || (SN = {}));
/*
 * Stake Night — the game-over overlay: arcade-style initials entry, score submission to
 * /api/scores, and the all-time / today leaderboard. Wires its own buttons (all handlers
 * reference symbols defined in this file).
 */
var SN;
(function (SN) {
    SN.overTitle = document.getElementById("over-title");
    SN.overFlavor = document.getElementById("over-flavor");
    SN.finalScoreEl = document.getElementById("final-score");
    SN.entryBlock = document.getElementById("entry-block");
    SN.boardBlock = document.getElementById("board-block");
    SN.boardList = document.getElementById("board-list");
    SN.charButtons = Array.from(document.querySelectorAll("#initials .char"));
    SN.btnSubmit = document.getElementById("btn-submit");
    SN.initialsState = [0, 0, 0];
    function showGameOver(victory) {
        if (SN.overTitle) {
            SN.overTitle.textContent = victory ? "Sunnydale Saved" : "Dawn Breaks";
        }
        if (SN.overFlavor) {
            const pool = victory ? SN.OVER_QUIPS.win : SN.OVER_QUIPS.loss;
            SN.overFlavor.textContent = pool[Math.floor(Math.random() * pool.length)];
        }
        SN.finalScoreEl.textContent = SN.state.score.toLocaleString();
        SN.entryBlock.classList.remove("hidden");
        SN.boardBlock.classList.add("hidden");
        SN.btnSubmit.disabled = false;
        SN.btnSubmit.textContent = "Carve It In";
        SN.hud.setAttribute("aria-hidden", "true");
        SN.overlayOver.classList.remove("hidden");
    }
    SN.showGameOver = showGameOver;
    SN.charButtons.forEach(function (btn) {
        var _a;
        const i = parseInt((_a = btn.dataset.i) !== null && _a !== void 0 ? _a : "0", 10);
        btn.addEventListener("click", function () { SN.initialsState[i] = (SN.initialsState[i] + 1) % SN.LETTERS.length; btn.textContent = SN.LETTERS[SN.initialsState[i]]; });
    });
    function currentInitials() { return SN.initialsState.map(i => SN.LETTERS[i]).join(""); }
    SN.currentInitials = currentInitials;
    // Pre-fill the arcade initials from the ones picked on the sign-in register (still editable).
    (function restoreInitials() {
        try {
            const saved = (localStorage.getItem("sn-initials") || "").toUpperCase();
            if (!/^[A-Z]{3}$/.test(saved)) {
                return;
            }
            for (let i = 0; i < 3; i++) {
                const idx = SN.LETTERS.indexOf(saved[i]);
                if (idx >= 0) {
                    SN.initialsState[i] = idx;
                }
            }
            SN.charButtons.forEach(b => { var _a; const i = parseInt((_a = b.dataset.i) !== null && _a !== void 0 ? _a : "0", 10); b.textContent = SN.LETTERS[SN.initialsState[i]]; });
        }
        catch { /* no storage */ }
    })();
    SN.tabAll = document.getElementById("tab-all");
    SN.tabToday = document.getElementById("tab-today");
    SN.lastSubmit = null;
    SN.boardPeriod = "all";
    SN.btnSubmit.addEventListener("click", async function () {
        SN.btnSubmit.disabled = true;
        SN.btnSubmit.textContent = "Carving…";
        SN.lastSubmit = { initials: currentInitials(), score: SN.state.score };
        try {
            localStorage.setItem("sn-initials", currentInitials());
        }
        catch { /* no storage */ } // carry back to the register
        let posted = null;
        try {
            const resp = await fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initials: SN.lastSubmit.initials, score: SN.lastSubmit.score, token: SN.state.runToken }) });
            if (resp.ok) {
                posted = await resp.json();
            }
        }
        catch (err) { /* offline */ }
        SN.entryBlock.classList.add("hidden");
        SN.boardBlock.classList.remove("hidden");
        if (posted && posted.top) {
            SN.boardPeriod = "all";
            setActiveTab();
            renderBoard(posted.top);
        }
        else {
            await loadBoard("all");
        }
    });
    async function loadBoard(period) {
        SN.boardPeriod = period;
        setActiveTab();
        let top = [];
        try {
            const resp = await fetch("/api/scores?top=10&period=" + period);
            if (resp.ok) {
                top = await resp.json();
            }
        }
        catch (err) { /* empty */ }
        renderBoard(top);
    }
    SN.loadBoard = loadBoard;
    function setActiveTab() { SN.tabAll === null || SN.tabAll === void 0 ? void 0 : SN.tabAll.classList.toggle("active", SN.boardPeriod === "all"); SN.tabToday === null || SN.tabToday === void 0 ? void 0 : SN.tabToday.classList.toggle("active", SN.boardPeriod === "today"); }
    SN.setActiveTab = setActiveTab;
    function isMine(row) { return !!SN.lastSubmit && row.initials === SN.lastSubmit.initials && row.score === SN.lastSubmit.score; }
    SN.isMine = isMine;
    function renderBoard(top) {
        SN.boardList.innerHTML = "";
        if (!top || top.length === 0) {
            const li = document.createElement("li");
            li.className = "empty";
            li.textContent = SN.boardPeriod === "today" ? "No slayers tonight — yet." : "No souls tallied yet. Be the first.";
            SN.boardList.appendChild(li);
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
            SN.boardList.appendChild(li);
        });
    }
    SN.renderBoard = renderBoard;
    SN.tabAll === null || SN.tabAll === void 0 ? void 0 : SN.tabAll.addEventListener("click", () => { loadBoard("all"); });
    SN.tabToday === null || SN.tabToday === void 0 ? void 0 : SN.tabToday.addEventListener("click", () => { loadBoard("today"); });
})(SN || (SN = {}));
/*
 * Stake Night — entry point. Loaded LAST in the concatenated build so every SN.* symbol it
 * wires up (start/again/story buttons, mute, the boot render) is already defined.
 *
 * Build: Scripts/*.ts → wwwroot/js/game.js via tsc (outFile concatenation; see tsconfig.json).
 * The page loads that single file as a plain <script> — no bundler, no module loader.
 */
var SN;
(function (SN) {
    var _a;
    document.getElementById("btn-start").addEventListener("click", SN.startGame);
    document.getElementById("btn-again").addEventListener("click", SN.startGame);
    (_a = document.getElementById("btn-story-continue")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", SN.continueStory);
    SN.overlayStory === null || SN.overlayStory === void 0 ? void 0 : SN.overlayStory.addEventListener("pointerdown", (e) => { e.preventDefault(); SN.continueStory(); });
    const btnMute = document.getElementById("btn-mute");
    function refreshMuteIcon() { if (btnMute) {
        btnMute.textContent = SN.Sound.isMuted() ? "🔇" : "🔊";
    } }
    btnMute === null || btnMute === void 0 ? void 0 : btnMute.addEventListener("click", () => { SN.Sound.resume(); SN.Sound.toggleMute(); refreshMuteIcon(); SN.Sound.sfx.ui(); });
    refreshMuteIcon();
    // ---- Boot -------------------------------------------------------------
    SN.loadSheets();
    SN.resize();
    SN.state = SN.freshState();
    SN.state.camX = -SN.viewW * 0.5;
    SN.seedBackground();
    SN.render();
})(SN || (SN = {}));
