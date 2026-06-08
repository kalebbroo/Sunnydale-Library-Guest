/*
 * Stake Night — tunables, enemy/stage data, and sprite-sheet definitions.
 * Pure data plus stage() (the current-stage accessor). No runtime side effects at load.
 */
namespace SN {
    // ---- Tunables ---------------------------------------------------------
    export const CONFIG = {
        floorTopFrac: 0.56, floorDepthFrac: 0.34, camLerp: 7,
        moveSpeed: 250, depthScale: 0.62, gravity: 2600, jumpVel: 720, coyoteMs: 90, jumpBufferMs: 120,
        attackCooldownMs: 300, attackMs: 160, attackReachX: 66, attackBandZ: 28, iframesMs: 1100,
        startLives: 3, maxLives: 5, baseKillPoints: 120,
        spawnStartMs: 1300, spawnMinMs: 550, spawnRampMs: 60000, maxEnemies: 12,
        pickupEveryMs: 14000, crossbowMs: 8000, boltSpeed: 700, holyRadius: 220,
        bossSpeed: 95, bossDashSpeed: 430,
        scytheMs: 9000, scytheReachMult: 1.8,
        throwCooldownMs: 600, throwSpeed: 760,
        knockImpulse: 460, knockFriction: 5, stunMs: 280,   // harder hits, longer slide
        // Enemy melee: hold at standoff in x, align in z, then telegraph + strike. Damage lands
        // only on the active frame, so the wind-up is a real dodge window.
        enemyStandoff: 46, enemyAttackRangeX: 60, enemyAttackBandZ: 22, enemyActiveMs: 120,
        maxAttackers: 2,               // attack tokens: how many vamps may swing at once
        enemySeparation: 26,           // gentle push-apart so they don't stack on one spot
        // Player getting hit: i-frames (above) + a shove + a brief loss of control. Heavy hits
        // (brute/boss/thrown) shove harder and lock control longer (a "knockdown").
        playerKnock: 300, hitstunMs: 300, heavyHitKnock: 430, knockdownMs: 620,
        hitStopMs: 60,                 // freeze-frames on a landed hit (juice)
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
        flawlessBonus: 1500,           // cleared a stage without taking a hit
        bgPar: { sky: 0.15, mid: 0.45, near: 1.0 },   // parallax factors for painted bg layers
        exitWalk: 440,                 // how far east to walk through an opened exit
    };

    export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    export const ENEMY_TYPES: Record<string, EnemyDef> = {
        grunt:  { hp: 2, w: 30, h: 62, speed: 80,  points: 120, color: "#1c1430", weight: () => 1.0,                         windup: 380, recover: 520, knock: 300, guard: 0    },
        runner: { hp: 1, w: 26, h: 56, speed: 150, points: 160, color: "#3a1330", weight: t => Math.max(0, t - 0.1) * 1.3,  windup: 240, recover: 360, knock: 260, guard: 0    },
        brute:  { hp: 4, w: 46, h: 78, speed: 55,  points: 380, color: "#0f1a14", weight: t => Math.max(0, t - 0.25) * 0.9, windup: 600, recover: 760, knock: 470, guard: 0.4  },
    };

    // ---- Stages (data-driven scenes; last one is the boss) ----------------
    export const STAGES: Stage[] = [
        { name: "Restfield Cemetery", quota: 6, waves: [3, 3], bg: "cemetery", palette: { sky0: "#0b0a14", sky1: "#241a30", floor0: "#2a2440", floor1: "#15101f", grave: "#161020" },
          story: "Patrol's on. The dead don't rest in Sunnydale — clear the fledglings prowling Restfield." },
        { name: "The Crypt", quota: 8, waves: [4, 4], bg: "crypt", palette: { sky0: "#0a0f14", sky1: "#16242a", floor0: "#223036", floor1: "#0e1418", grave: "#0d1a1f" },
          story: "Down into the crypt. Colder here, and something's been feeding well." },
        { name: "Sunnydale High Halls", quota: 10, waves: [3, 3, 4], bg: "halls", levelUp: true, palette: { sky0: "#14100a", sky1: "#2a2014", floor0: "#3a2f1f", floor1: "#1a140c", grave: "#241a10" },
          story: "Back at school after dark. Giles stocked your locker — a brace of throwing stakes.\nLEVEL UP: press THROW (L) to hurl a stake!" },
        { name: "The Library", quota: 12, waves: [4, 4, 4], bg: "library", palette: { sky0: "#0e0a14", sky1: "#241a30", floor0: "#2e2640", floor1: "#16101f", grave: "#1a1428" },
          story: "The library sits right over the Hellmouth. They're pouring out. Hold the line." },
        { name: "The Master's Lair", quota: 0, boss: true, bg: "lair", palette: { sky0: "#160608", sky1: "#2a0c10", floor0: "#2a1014", floor1: "#120608", grave: "#1c0a0c" },
          story: "The Master himself. This is what you were chosen for, Slayer. End it." },
    ];
    export function stage(): Stage { return STAGES[Math.max(0, Math.min(state.stageIndex, STAGES.length - 1))]; }

    // ---- Sprite sheets (see SPRITES.md) -----------------------------------
    // Animation rows. Actors share rows 0-3; the player adds rows 4-8 for the richer move set
    // (jump, knockdown, throw, block, victory) and enemies add a knockdown row. Each entry is
    // { row index, frame count, playback fps, loops }. The loader reads frame f of row r from the
    // pixel rect (f·fw, r·fh, fw, fh). Names here are the strings code assigns to actor.anim.
    export const PLAYER_ANIMS: Record<string, AnimDef> = {
        idle:      { row: 0, frames: 4, fps: 6,  loop: true  },
        walk:      { row: 1, frames: 6, fps: 12, loop: true  },
        attack:    { row: 2, frames: 4, fps: 18, loop: false },
        hurt:      { row: 3, frames: 2, fps: 10, loop: false },
        jump:      { row: 4, frames: 3, fps: 10, loop: false },
        knockdown: { row: 5, frames: 4, fps: 8,  loop: false },
        throw:     { row: 6, frames: 3, fps: 14, loop: false },
        block:     { row: 7, frames: 2, fps: 12, loop: false },
        victory:   { row: 8, frames: 3, fps: 6,  loop: false },
    };
    export const ENEMY_ANIMS: Record<string, AnimDef> = {
        idle:      { row: 0, frames: 4, fps: 6,  loop: true  },
        walk:      { row: 1, frames: 6, fps: 12, loop: true  },
        attack:    { row: 2, frames: 4, fps: 16, loop: false },
        hurt:      { row: 3, frames: 2, fps: 10, loop: false },
        knockdown: { row: 4, frames: 4, fps: 8,  loop: false },
    };
    export const BOSS_ANIMS: Record<string, AnimDef> = {
        idle:   { row: 0, frames: 4, fps: 6,  loop: true  },
        walk:   { row: 1, frames: 6, fps: 12, loop: true  },
        attack: { row: 2, frames: 4, fps: 16, loop: false },
        hurt:   { row: 3, frames: 2, fps: 10, loop: false },
    };
    // The sheets the loader fetches. Until a PNG exists the actor draws procedurally (drawSheet
    // returns false), so art can ship one file at a time. fw/fh is the source cell; `scale` sizes
    // it on screen (≈ a head taller than the hitbox). `smooth: true` keeps painterly/HD source art
    // crisp when scaled down — set false for true pixel art.
    export const SHEETS: Record<string, SheetDef> = {
        buffy:  { src: "/img/buffy.png",       fw: 96,  fh: 128, scale: 0.75, smooth: true, anims: PLAYER_ANIMS },
        grunt:  { src: "/img/vamp_grunt.png",  fw: 80,  fh: 112, scale: 0.75, smooth: true, anims: ENEMY_ANIMS },
        runner: { src: "/img/vamp_runner.png", fw: 80,  fh: 112, scale: 0.75, smooth: true, anims: ENEMY_ANIMS },
        brute:  { src: "/img/vamp_brute.png",  fw: 112, fh: 144, scale: 0.78, smooth: true, anims: ENEMY_ANIMS },
        boss:   { src: "/img/master.png",      fw: 144, fh: 176, scale: 0.80, smooth: true, anims: BOSS_ANIMS },
    };
}
