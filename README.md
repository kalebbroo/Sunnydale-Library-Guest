# Sunnydale Library Guest Portal

ASP.NET Core Razor Pages app fronting a UniFi guest WiFi captive portal, themed as the
Sunnydale High School library card-catalog sign-in page (Buffy bit). Guests sign the
register; the app authorizes their MAC against the UDM SE controller for a configurable
window, then redirects them to whatever URL they were originally trying to reach.

Hidden in the portal is **Stake Night** — a canvas side-scroller where you play Buffy
staking vampires for a high score, with a shared leaderboard so everyone on the guest
network can compete to be the top patron. The board is disguised on the sign-in page as a
"Frequently Checked Out" circulation card, and a subtle stake in the footer (plus the card
itself) links into the game at `/Game`. The game is playable without signing in.

## How the captive flow works

```
Guest device joins guest SSID
        ↓
UniFi intercepts unauthorized HTTP and redirects to:
  http://<deploy-host-lan-ip>/guest/s/<site>/?id=<mac>&ap=<ap-mac>&t=<ts>&url=<orig>&ssid=<ssid>
        ↓
Splash page renders, guest fills in name + reason + accepts policy
        ↓
POST → /Success → IUnifiClient.AuthorizeGuestAsync(mac, ap, minutes)
                  → POST /api/auth/login
                  → POST /proxy/network/api/s/<site>/cmd/stamgr  (with X-CSRF-Token)
        ↓
302 → original requested URL
```

## Stack

- .NET 9 / ASP.NET Core Razor Pages
- SQLite (`Microsoft.Data.Sqlite`, ADO.NET — no EF) for the leaderboard
- HTML5 Canvas game written in **TypeScript** (`Scripts/game.ts`), compiled to a single
  plain-IIFE `wwwroot/js/game.js` by `tsc` during `dotnet build`
- Docker (multi-stage build, runs as non-root; build stage installs Node for `tsc`)
- Custom `Logs` class — no `ILogger<T>`
- Mobile-first CSS; the sign-in flow works on the iOS captive WebKit view without JS
  (the game itself needs JS, as expected)

## Client build (TypeScript)

The game's source of truth is **`Scripts/game.ts`**. It compiles to `wwwroot/js/game.js`
(ES2019, so `tsc` downlevels optional-chaining / nullish for older iOS captive webviews).

- **Automatic:** a `CompileGameTypeScript` MSBuild target in `SunnydaleLibrary.csproj` runs
  `npm install` (first time) + `tsc` on every `dotnet build`. Needs **Node.js** on PATH.
- **Resilient:** if Node isn't installed, the target logs a warning (`MSB3073 … npm: not
  found`) and the build still succeeds, falling back to the **committed** `wwwroot/js/game.js`.
  That compiled file is checked in on purpose so the app runs on Node-less hosts; `dotnet
  build` regenerates it wherever Node is present (including the Docker image).
- **Manual / watch:** `npm install` then `npm run build` (one-shot) or `npm run watch`.
- Edit the game in `Scripts/game.ts`, not the generated `wwwroot/js/game.js`.

## The game & leaderboard

- **`/Game`** — Stake Night, a side-scrolling platformer. Run and jump through an endless
  graveyard (on-screen touch pads; ←→/Space/J on desktop), staking four vampire types,
  grabbing power-ups (heart / crossbow / holy water), and surviving the mini-boss (The
  Master) at score milestones. Three lives, combo multiplier, difficulty ramps with time.
  On game over you enter arcade-style initials (AAA) and your score posts to the board.
- The board has **All-Time** and **Tonight** (today, UTC) views — game-over screen has tabs,
  and the splash shows "tonight's top slayer."
- **Leaderboard API** (public read, guarded write; consumed by `wwwroot/js/game.js`):
  - `POST /api/run/start` → `{ token }` — a signed run token, requested when a game begins.
  - `GET /api/scores?top=10&period=today|all` → top-N scores as JSON (defaults to all-time).
  - `POST /api/scores` `{ "initials": "BTV", "score": 4820, "token": "…" }` → persists and
    returns `{ rank, entry, top }`.
- Scores live in SQLite on the `app_data` Docker volume, so they survive restarts.
- **Anti-cheat (run tokens).** A score submit must carry a valid, signed, single-use run
  token (HMAC, issued at game start). The server rejects submissions that are tokenless,
  replayed, stale, too fast (`MinPlaySeconds`), or implausibly high for the elapsed play time
  (`PointsPerSecondCap`). This stops the trivial "`curl` a million points" attack the v1 board
  was open to. It's not bulletproof (a determined player can drive a slow real session and
  submit a capped score), but it makes the board meaningfully trustworthy. Set
  `Leaderboard:RequireRunToken=false` to disable. The signing key comes from
  `LEADERBOARD_SIGNING_KEY`; if unset, an ephemeral per-process key is generated (tokens
  reset on restart — fine, since tokens are short-lived).
- Other dampening: initials charset, score clamp to `MaxScore`, per-client submit cooldown.

## Port

Host-exposed port: **80**. Container-internal: 8080. UniFi's External Portal Server field
is strict IPv4 with no port — the redirect URL it generates uses port 80 implicitly. The
Docker daemon runs as root and binds the privileged port for the container without extra
config. Make sure nothing else on the host is listening on 80 before bringing this up
(`sudo ss -tlnp | grep :80`).

## First-time deploy

```bash
git clone <repo>
cd Sunnydale-Library-Guest
cp .env.production.example .env.production
nano .env.production            # fill UDM creds
./deploy-production.sh --init
```

Day-to-day:

```bash
./deploy-production.sh          # rebuild + restart
./deploy-production.sh --logs   # tail
./deploy-production.sh --down   # stop
```

## UniFi-side setup (one-time, manual)

1. **Local-only admin:** UniFi Network → Settings → Admins & Users → Add New Admin →
   "Restrict to local access only." Site Admin role on the `default` site. Use those
   creds in `.env.production` as `UNIFI_USERNAME` / `UNIFI_PASSWORD`.
2. **External Portal Server:** Settings → Hotspot → Guest Hotspot → External Portal
   Server → enter the **LAN IP** of the deploy host (the field is strict IPv4; no
   scheme, no port).
3. **Pre-Authorization Access:** add `<deploy-host-lan-ip>` so unauthenticated guests
   can reach the portal page before they're authorized.
4. **Firewall rule (Settings → Security → Traffic Rules):** Allow `Hotspot zone →
   <deploy-host-lan-ip>:80`, priority above any default block. (Stateful firewall
   handles return traffic; do not create a separate "(Return)" rule.)

## Configuration

`dotenv.net` loads `.env` (dev) or `.env.production` (prod) at startup; env vars
override `appsettings.json` defaults.

| Var | Purpose |
|---|---|
| `UNIFI_CONTROLLER_URL` | UDM SE LAN URL, e.g. `https://192.168.1.1` (no port for UDM family) |
| `UNIFI_USERNAME` / `UNIFI_PASSWORD` | Local-access UniFi admin credentials |
| `UNIFI_SITE` | Usually `default` |
| `UNIFI_DEFAULT_MINUTES` | How long to authorize each guest (e.g. `480` = 8h) |
| `UNIFI_VERIFY_TLS` | `false` for the UDM's self-signed cert |
| `UNIFI_TIMEOUT_SECONDS` | HTTP timeout for controller calls (default `10`); keeps a slow/down UDM from hanging sign-in |
| `LEADERBOARD_DATABASE_PATH` | SQLite file path. Blank → `/app/data/leaderboard.db` (Docker) or `./data/leaderboard.db` (local) |
| `LEADERBOARD_TOP_COUNT` | Rows shown on the public board (default `10`) |
| `LEADERBOARD_MAX_SCORE` | Reject submissions above this as implausible (default `1000000`) |
| `LEADERBOARD_SUBMIT_COOLDOWN_SECONDS` | Min seconds between accepted submits per client (default `3`) |
| `LEADERBOARD_REQUIRE_RUN_TOKEN` | Require a signed run token on submit (default `true`) |
| `LEADERBOARD_SIGNING_KEY` | HMAC key for run tokens; blank → ephemeral per-process key |
| `LEADERBOARD_POINTS_PER_SECOND_CAP` | Max plausible points earned per played second (default `3000`) |

## Operations & hardening

- **Health check:** `GET /healthz` returns `200 Healthy` (liveness only — it does *not* depend on the
  DB, so a leaderboard outage won't get the container killed). The Dockerfile declares a
  `HEALTHCHECK` that curls it every 30s, so `restart: unless-stopped` recovers a wedged container.
- **Sign-in is decoupled from the game.** The splash loads the leaderboard inside a `try/catch`
  ([Index.cshtml.cs](Pages/Index.cshtml.cs)); if SQLite is locked/unavailable the board renders empty
  and guests can still sign in. A game/DB problem never blocks WiFi access.
- **Fail-fast UniFi calls.** Controller requests use `UNIFI_TIMEOUT_SECONDS` (default 10s) instead of
  the 100s default, so a slow/down UDM surfaces the "wards refused entry" message quickly.
- **Rate limiting** (per client IP, built-in `AddRateLimiter`): a 120/min global safety net on dynamic
  requests (static files bypass it), `POST /Success` capped at 15/min (each one logs into the UDM),
  and the `/api/*` score endpoints at 40/min. Over-limit requests get `429`.
- **Run-token key:** set `LEADERBOARD_SIGNING_KEY` in production so a restart doesn't invalidate
  in-flight game tokens (otherwise an ephemeral key is generated per process).

## Surface gags (zero-cost theming)

The splash keeps a few in-character touches: struck-through evening library hours, a
"Slaying-Related" reason option, the © 1999 footer, and the disguised circulation-card
leaderboard.
