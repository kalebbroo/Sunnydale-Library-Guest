/*
 * Stake Night — shared type declarations.
 *
 * Every game file is `namespace SN { ... }`; tsc concatenates them (outFile) into the single
 * wwwroot/js/game.js the page loads as a plain <script> (no bundler, no module loader — kept
 * that way for old iOS captive webviews). See SPRITES.md and the header in canvas.ts for the
 * coordinate system and art pipeline.
 */
namespace SN {
    // ---- Actors -----------------------------------------------------------
    export interface EnemyDef {
        hp: number; w: number; h: number; speed: number; points: number; color: string;
        weight: (t: number) => number;
        windup: number;   // ms of telegraph before a strike lands (longer = easier to read)
        recover: number;  // ms of vulnerable recovery after a strike
        knock: number;    // knockback dealt to the player on a landed hit
        guard: number;    // 0..1 chance to raise a block when the player winds up (0 = never)
    }
    // Enemy behaviour is a small state machine: chase to standoff range → windup (telegraph) →
    // active (strike resolves on entry) → recover. Touching the player never hurts — only a
    // landed strike does. "block" guards against normal hits; "down"/"getup" is the knockdown
    // (launched into a gravity arc, slides, lies, gets up). "thrown" is a grabbed body in flight.
    // See update.ts.
    export type EnemyPhase = "chase" | "windup" | "active" | "recover" | "block" | "down" | "getup" | "thrown";
    export interface Enemy {
        type: string;
        x: number; z: number; y: number; vy: number; // vy = vertical velocity for knockdown arcs
        vx: number; vz: number; stunUntil: number;   // knockback
        w: number; h: number; hp: number; def: EnemyDef;
        wobble: number; contactUntil: number; hitBy: number; alive: boolean;
        anim: string; animStart: number;
        phase: EnemyPhase; phaseUntil: number;        // attack / knockdown state machine
        grabbed: boolean; bounced: boolean;           // held by player / has wall-bounced this knockdown
    }
    export interface Player {
        x: number; z: number; y: number; vy: number;
        w: number; h: number; facing: number; moving: boolean;
        onGround: boolean; lastGroundMs: number;
        attackUntil: number; lastAttackMs: number; hurtUntil: number;
        hitstunUntil: number; knockVx: number; knockVz: number;   // knocked-back-on-hit
        chain: number; chainAt: number;               // melee combo chain (every Nth = finisher)
        grabbing: Enemy | null; grabUntil: number;    // currently held vamp + auto-release time
        crossbowUntil: number; scytheUntil: number;
        canThrow: boolean; lastThrowMs: number;
        lives: number; anim: string; animStart: number; _wasPower?: boolean;
    }
    export interface Pickup { type: "heart" | "crossbow" | "holy" | "scythe"; x: number; z: number; bob: number; born: number; taken?: boolean; }
    export interface Bolt { kind: "bolt" | "stake"; x: number; z: number; y: number; vx: number; spin: number; alive: boolean; }
    export interface Dust { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; }
    export interface Popup { x: number; y: number; text: string; life: number; max: number; vy: number; }
    export interface Banner { text: string; until: number; }
    export interface Boss {
        x: number; z: number; y: number; w: number; h: number; hp: number; maxHp: number;
        nextDashAt: number; dashUntil: number; dashVx: number; dashVz: number; contactUntil: number; hitBy: number;
    }
    export interface GameState {
        running: boolean;
        phase: "playing" | "cleared";
        score: number; combo: number; bestCombo: number; elapsed: number;
        stageIndex: number; spawnedThisStage: number; defeatedThisStage: number;
        exitOpen: boolean; exitX: number; bossSpawned: boolean; victory: boolean;
        tookDamageThisStage: boolean;                 // cleared without it → Flawless bonus
        arenaLocked: boolean; arenaMaxX: number; waveIndex: number;   // wave-gating (camera lock)
        spawnTimer: number; pickupTimer: number; camX: number; attackId: number; flash: number; hitStop: number;
        player: Player;
        enemies: Enemy[]; pickups: Pickup[]; bolts: Bolt[]; dust: Dust[];
        stars: { x: number; y: number; r: number; tw: number; par: number }[];
        graves: { x: number; w: number; h: number; par: number }[];
        boss: Boss | null; popups: Popup[]; banner: Banner | null; shake: number; runToken: string | null;
    }

    // ---- Stages -----------------------------------------------------------
    export interface Palette { sky0: string; sky1: string; floor0: string; floor1: string; grave: string; }
    export interface Stage { name: string; quota: number; boss?: boolean; levelUp?: boolean; palette: Palette; story: string; waves?: number[]; bg?: string; }

    // ---- Sprite sheets (see SPRITES.md) -----------------------------------
    export interface AnimDef { row: number; frames: number; fps: number; loop: boolean; }
    export interface SheetDef { src: string; fw: number; fh: number; scale: number; anims: Record<string, AnimDef>; smooth?: boolean; }
    export interface SheetState { def: SheetDef; img: HTMLImageElement | null; ready: boolean; }

    // ---- Leaderboard ------------------------------------------------------
    export type Row = { rank: number; initials: string; score: number };
}
