# Sunnydale Library Guest Portal

ASP.NET Core Razor Pages app fronting a UniFi guest WiFi captive portal, themed as the
Sunnydale High School library card-catalog sign-in page (Buffy bit). Guests sign the
register; the app authorizes their MAC against the UDM SE controller for a configurable
window, then redirects them to whatever URL they were originally trying to reach.

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
- Docker (multi-stage build, runs as non-root)
- Custom `Logs` class — no `ILogger<T>`
- Mobile-first CSS, works on the iOS captive WebKit view without JS

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

## Easter eggs (scaffolded, not implemented)

`IEasterEggService` is registered in DI with a no-op implementation. TODO markers
throughout the code (`easter-egg-tier1` / `tier2` / `tier3`) flag where the rabbit-hole
content slots in later. The splash already has a few zero-cost surface gags baked in
(struck-through evening hours, "Slaying-Related" reason option, 1999 footer).
