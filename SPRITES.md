# Stake Night — sprite asset spec

The game renders every actor through `drawActor`/`drawSheet` in [Scripts/game.ts](Scripts/game.ts).
If a sprite sheet is present it's used; otherwise the game falls back to the built-in procedural
shapes. So you can ship art incrementally — drop a sheet in and it lights up, no code change.

## Where files go

Put PNGs in **`wwwroot/img/`**. They're served at `/img/<name>.png`. Use **transparent PNG**.
Pixel art is rendered with smoothing **off** (crisp), so author at the real frame size (or an
exact 2×/3× multiple).

## Sheet format

Each sheet is a grid: **one animation per row**, **frames left→right within a row**.
The engine reads frame `f` of row `r` from pixel rect `(f·fw, r·fh, fw, fh)`.

Rows (must be in this order — from `ACTOR_ANIMS` in game.ts):

| Row | Animation | Frames | FPS | Loops |
|-----|-----------|--------|-----|-------|
| 0 | idle   | 4 | 6  | yes |
| 1 | walk   | 6 | 12 | yes |
| 2 | attack | 3 | 18 | no  |
| 3 | hurt   | 2 | 10 | no  |

So a sheet is `(maxFrames · fw)` wide by `(4 · fh)` tall. Rows may be padded with blank frames
(walk uses the most at 6, so width = `6 · fw`).

```
 col0   col1   col2   col3   col4   col5
+------+------+------+------+------+------+
| idle | idle | idle | idle |      |      |   row 0
+------+------+------+------+------+------+
| walk | walk | walk | walk | walk | walk |   row 1
+------+------+------+------+------+------+
| atk  | atk  | atk  |      |      |      |   row 2
+------+------+------+------+------+------+
| hurt | hurt |      |      |      |      |   row 3
+------+------+------+------+------+------+
```

## Anchoring & facing

- Each frame is drawn **anchored at the feet** (bottom-center). Draw the character standing on
  the bottom edge of the cell, horizontally centered.
- Author all art **facing RIGHT**. The engine flips horizontally when the actor faces left.

## The sheets the engine looks for

| File (`wwwroot/img/`) | Frame `fw × fh` | Who |
|---|---|---|
| `buffy.png`       | 64 × 64 | The player |
| `vamp_grunt.png`  | 48 × 64 | Grunt vampire (2 HP) |
| `vamp_runner.png` | 48 × 64 | Runner vampire (fast, 1 HP) |
| `vamp_brute.png`  | 64 × 80 | Brute vampire (4 HP) |
| `master.png`      | 80 × 96 | The Master (mini-boss) |

(These names/sizes are defined in the `SHEETS` map in game.ts — change there if you want
different dimensions.)

## Optional extras (not required; procedural until added)

- **HUD portrait:** wire a `portrait_buffy.png` into `.hud-portrait` via CSS `background-image`
  in [wwwroot/css/game.css](wwwroot/css/game.css).
- **Parallax background layers** (sky / gravestones / floor) are currently drawn procedurally in
  `render()`. They can be swapped for layered PNGs later — say the word and I'll add a bg layer
  loader to the same fallback pattern.

## Adding a new enemy type

1. Add an entry to `ENEMY_TYPES` (hp/size/speed/points/spawn weight) in game.ts.
2. Add a matching entry to `SHEETS` (its `src` + frame size). Until the PNG exists it draws as a
   procedural vampire. Done.

## Licensing reminder

Use **original** art (or CC0/licensed packs you're allowed to ship). Do **not** use sprites
ripped from TMNT: Shredder's Revenge or other commercial games — match the *style*, not the assets.
