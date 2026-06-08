# Stake Night — art asset spec (sprites + backgrounds)

Every actor renders through `drawSheet` in [Scripts/sprites.ts](Scripts/sprites.ts), driven by the
`SHEETS` / `*_ANIMS` tables in [Scripts/config.ts](Scripts/config.ts). If a sheet PNG is present it's
used; otherwise the game falls back to built-in procedural shapes. So you can ship art **one file at
a time** — drop a sheet in and it lights up, no code change.

---

## 1. Character sprite sheets

### Where files go
Put PNGs in **`wwwroot/img/`** (served at `/img/<name>.png`). Use **32-bit PNG with transparency**
(RGBA). The reference pose strip is painterly/HD — that's the intended style. The engine draws these
sheets with **smoothing ON** (`smooth: true`), so HD source art scales down cleanly; you do **not**
need to hand-pixel them. (Set `smooth: false` on a sheet only if you author true pixel art.)

### Sheet format — a uniform grid
**One animation per row, frames left→right within the row.** Every cell in a sheet is the same size
`fw × fh`. The engine reads frame `f` of row `r` from the pixel rect `(f·fw, r·fh, fw, fh)`.

The loose pose strip you have needs to be **normalized into this grid**: same cell size everywhere,
one move per row, evenly spaced frames, transparent background.

### Rows the engine expects

**Player (`buffy.png`)** — full move set (rows 4–8 power the planned features):

| Row | Animation  | Frames | FPS | Loops | Notes |
|-----|------------|--------|-----|-------|-------|
| 0 | idle       | 4 | 6  | yes | fighting-stance breathing (your hand-on-hip / stance pose) |
| 1 | walk       | 6 | 12 | yes | walk/run cycle (your stride poses) |
| 2 | attack     | 4 | 18 | no  | melee combo — punch / stake swing (frame 4 = the finisher hit) |
| 3 | hurt       | 2 | 10 | no  | recoil when hit |
| 4 | jump       | 3 | 10 | no  | crouch → rise → fall (also used for the jump-attack) |
| 5 | knockdown  | 4 | 8  | no  | hit → airborne → on the ground → getting up |
| 6 | throw      | 3 | 14 | no  | grab → throw → recover |
| 7 | block      | 2 | 12 | no  | raise guard → hold |
| 8 | victory    | 3 | 6  | no  | arms-up celebration (your final pose) — stage/game clear |

**Enemies (`vamp_grunt.png`, `vamp_runner.png`, `vamp_brute.png`)**:

| Row | Animation | Frames | FPS | Loops |
|-----|-----------|--------|-----|-------|
| 0 | idle      | 4 | 6  | yes |
| 1 | walk      | 6 | 12 | yes |
| 2 | attack    | 4 | 16 | no  | claw/lunge — plays during the wind-up + strike |
| 3 | hurt      | 2 | 10 | no  |
| 4 | knockdown | 4 | 8  | no  | for the knockdown feature |

**Boss (`master.png`)**: rows 0–3 only (idle / walk / attack / hurt).

Rows may be padded with blank cells on the right; sheet **width = (max frames in any row) · fw**.
For the player that's `6 · fw`; sheet **height = (row count) · fh** = `9 · fh`.

```
 col0   col1   col2   col3   col4   col5
+------+------+------+------+------+------+
| idle | idle | idle | idle |      |      |  row 0
+------+------+------+------+------+------+
| walk | walk | walk | walk | walk | walk |  row 1
+------+------+------+------+------+------+
| atk  | atk  | atk  | atk  |      |      |  row 2
+------+------+------+------+------+------+
| ...  rows 3-8 (hurt, jump, knockdown, throw, block, victory) ...   |
+------+------+------+------+------+------+
```

### Cell sizes the engine is configured for

| File (`wwwroot/img/`) | Cell `fw × fh` | Full-sheet PNG (`6·fw × rows·fh`) | On-screen scale |
|---|---|---|---|
| `buffy.png`       | **96 × 128**  | 576 × 1152 (9 rows) | 0.75 → ~72×96 |
| `vamp_grunt.png`  | **80 × 112**  | 480 × 560  (5 rows) | 0.75 → ~60×84 |
| `vamp_runner.png` | **80 × 112**  | 480 × 560  (5 rows) | 0.75 → ~60×84 |
| `vamp_brute.png`  | **112 × 144** | 672 × 720  (5 rows) | 0.78 → ~87×112 |
| `master.png`      | **144 × 176** | 864 × 704  (4 rows) | 0.80 → ~115×141 |

These are in the `SHEETS` map in [config.ts](Scripts/config.ts) — tweak `fw/fh/scale` there if you
author at a different size. `scale` only changes on-screen size, not the file. If you want extra
retina crispness, author at **2× these cells** (e.g. Buffy 192×256) and drop `scale` to match.

### Anchoring & facing (important — get this consistent)
- Each frame is drawn **anchored at the feet: bottom-center of the cell**. Stand the character on the
  **bottom edge**, horizontally centered. Keep the **same ground line and same center-x in every
  frame** so she doesn't bob or drift between frames. (Jump frames are still feet-anchored — the
  engine lifts the whole sprite by jump height.)
- Author everything **facing RIGHT**. The engine mirrors horizontally when the actor faces left, so
  don't draw left-facing frames.

---

## 2. Level backgrounds

Backgrounds are currently **procedural** in `render()` ([Scripts/render.ts](Scripts/render.ts)): a
per-stage palette paints a sky gradient, parallax stars, a moon, parallax gravestones, and a floor
gradient. You can replace these with painted **parallax layers**; the loader will use the same
"present → use it, absent → procedural" fallback (this is item 9 in the implementation plan).

### Layer model
The camera pans horizontally with the player (`camX`); depth is faked with parallax factors (stars
already move at 0.2, graves at 0.5, floor at 1.0). A stage is a few screens wide. Author **3 layers**:

| Layer | Parallax | Transparency | Suggested size | Content |
|---|---|---|---|---|
| `sky` (far)    | ~0.15 | opaque (JPG ok) | **2048 × 768** | sky, horizon, moon, distant skyline — tiles/loops horizontally |
| `mid`          | ~0.45 | **PNG-32 alpha** | **3072 × 768** | crypts, trees, school halls — the stage's identity, with gaps showing sky |
| `near` (floor) | 1.0   | **PNG-32 alpha** | **3072 × 768** | foreground floor detail, debris, gravestones that pass behind actors |

### Sizing rules
- **Height:** author at **768 px** tall (the design viewport height). The engine scales layers to the
  live `viewH` and pins the horizon to the floor line (`floorTopFrac` = 0.56, so horizon ≈ 56% down).
  For retina, supply **2× (1536 tall)** — file size permitting.
- **Width:** the `sky` layer should **tile seamlessly** (left edge == right edge) since it loops. The
  `mid`/`near` layers span the stage; ~**3–4 screen-widths (≈3072–4096 px)** covers a stage. They
  don't need to tile if they're at least as wide as the stage travel (start → exit + a screen).
- **Format:** `sky` can be **JPG** (no alpha, smaller). `mid`/`near` **must be PNG-32** (alpha so
  actors show through gaps and pass in front of/behind props).
- **Safe area:** keep important art away from the top/bottom 8% — different aspect ratios crop there.

### Per-stage files
One set per stage, e.g. `bg_cemetery_{sky,mid,near}.png`, `bg_crypt_*`, `bg_halls_*`, `bg_library_*`,
`bg_lair_*` — matching the 5 stages in `STAGES`. Until a stage's PNGs exist it keeps its procedural
palette, so you can paint them one stage at a time.

---

## 3. Optional extras
- **HUD portrait:** wire `portrait_buffy.png` into `.hud-portrait` via CSS `background-image` in
  [wwwroot/css/game.css](wwwroot/css/game.css).
- **Pickups / projectiles** are procedural and small; fine to leave as-is.

## 4. Adding a new enemy type
1. Add an entry to `ENEMY_TYPES` (hp/size/speed/points/spawn weight + windup/recover/knock) in
   [config.ts](Scripts/config.ts).
2. Add a matching `SHEETS` entry (its `src` + cell size, `anims: ENEMY_ANIMS`). Until the PNG exists
   it draws as a procedural vampire. Done.

## 5. Licensing reminder
Use **original** art (or CC0 / properly licensed packs). Do **not** use sprites ripped from
TMNT: Shredder's Revenge or other commercial games — match the *style*, not the assets.
