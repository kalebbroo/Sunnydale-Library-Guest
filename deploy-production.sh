#!/bin/bash
# ============================================
# Sunnydale Library Guest Portal — production deploy
# Container exposes the splash on host port 8080 (see docker-compose.prod.yml).
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
    if [ ${#missing[@]} -gt 0 ]; then
        warn "These values look empty in $ENV_FILE: ${missing[*]}"
        warn "(continuing anyway; authorize-guest calls will fail until creds are filled in)"
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
    log "  Portal is reachable on this host at:  http://<lan-ip>:8080/"
    log "  Reminder:"
    log "    - UniFi Hotspot → External Portal Server: this host's LAN IP (no scheme, no port)"
    log "    - UniFi Pre-Authorization Access list: add <lan-ip>:8080"
    log "    - Guest VLAN firewall: allow Guest -> <lan-ip>:8080"
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
