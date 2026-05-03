#!/bin/bash
# ============================================
# Sunnydale Library Guest Portal — production deploy
# Cloudflare tunnel sidecar handles TLS + ingress.
# ============================================
# Usage:
#   First time:  ./deploy-production.sh --init
#   Rebuild:     ./deploy-production.sh
#   Teardown:    ./deploy-production.sh --down
#   Logs:        ./deploy-production.sh --logs
# ============================================
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ------------------------------------------
# Prerequisites
# ------------------------------------------
check_prereqs() {
    command -v docker >/dev/null 2>&1 || error "Docker is not installed"
    docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is not installed"

    if [ ! -f "$ENV_FILE" ]; then
        error "$ENV_FILE not found. Copy .env.production.example to $ENV_FILE and fill in your values."
    fi

    # Sanity-check that key UniFi vars are set (not just blank).
    local missing=()
    grep -qE '^UNIFI_CONTROLLER_URL=.+' "$ENV_FILE" || missing+=("UNIFI_CONTROLLER_URL")
    grep -qE '^UNIFI_USERNAME=.+'       "$ENV_FILE" || missing+=("UNIFI_USERNAME")
    grep -qE '^UNIFI_PASSWORD=.+'       "$ENV_FILE" || missing+=("UNIFI_PASSWORD")
    grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' "$ENV_FILE" || missing+=("CLOUDFLARE_TUNNEL_TOKEN")
    if [ ${#missing[@]} -gt 0 ]; then
        warn "These values look empty in $ENV_FILE: ${missing[*]}"
        warn "(continuing anyway; the tunnel will fail without the token, and authorize-guest will fail without UniFi creds)"
    fi
}

# ------------------------------------------
# Build & start
# ------------------------------------------
deploy() {
    log "Building and starting Sunnydale Library guest portal..."
    docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans
    log "Deployment complete."
    echo ""
    log "Services:"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    log "Tail logs with:  ./deploy-production.sh --logs"
}

# ------------------------------------------
# First-time init
# ------------------------------------------
init() {
    log "=== First-time setup ==="
    deploy
    echo ""
    log "============================================"
    log "  Initial deployment complete!"
    log "  Reminder:"
    log "    - In Cloudflare Zero Trust, point the tunnel hostname (guest.hartsy.ai) at http://web:8080"
    log "    - In UniFi Hotspot settings, point External Portal at this server's LAN IP"
    log "    - Add the same LAN IP + portal port to UniFi's Pre-Authorization Access list"
    log "============================================"
}

# ------------------------------------------
# Stop
# ------------------------------------------
teardown() {
    warn "Stopping all containers..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans
    log "All containers stopped."
}

# ------------------------------------------
# Logs
# ------------------------------------------
show_logs() {
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100
}

# ------------------------------------------
# Main
# ------------------------------------------
check_prereqs

case "${1:-}" in
    --init)
        init
        ;;
    --down)
        teardown
        ;;
    --logs)
        show_logs
        ;;
    *)
        log "=== Rebuilding and redeploying ==="
        deploy
        ;;
esac
