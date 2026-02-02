#!/bin/bash
set -e

# Playwright Render API - Deployment Script for Hostinger VPS
# Usage: ./scripts/deploy.sh [--build] [--restart]

# Configuration
APP_NAME="playwright-render-api"
APP_DIR="/opt/$APP_NAME"
COMPOSE_FILE="docker-compose.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
BUILD=false
RESTART=false

for arg in "$@"; do
    case $arg in
        --build)
            BUILD=true
            ;;
        --restart)
            RESTART=true
            ;;
    esac
done

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    log_error "Please run with sudo"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$APP_DIR/.env" ]; then
    log_error ".env file not found at $APP_DIR/.env"
    log_info "Copy .env.example to .env and configure it:"
    log_info "  cp $APP_DIR/.env.example $APP_DIR/.env"
    log_info "  nano $APP_DIR/.env"
    exit 1
fi

cd "$APP_DIR"

# Pull latest changes (if git repo)
if [ -d ".git" ]; then
    log_info "Pulling latest changes..."
    git pull origin main || log_warn "Git pull failed, continuing with local files"
fi

# Build if requested
if [ "$BUILD" = true ]; then
    log_info "Building Docker image..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache
fi

# Restart if requested
if [ "$RESTART" = true ]; then
    log_info "Restarting container..."
    docker-compose -f "$COMPOSE_FILE" down
fi

# Start/update container
log_info "Starting container..."
docker-compose -f "$COMPOSE_FILE" up -d

# Wait for health check
log_info "Waiting for health check..."
sleep 10

# Check health
HEALTH=$(curl -s http://localhost:3001/health/live 2>/dev/null || echo '{"alive":false}')
if echo "$HEALTH" | grep -q '"alive":true'; then
    log_info "Service is healthy!"
else
    log_error "Service health check failed"
    log_info "Checking logs..."
    docker-compose -f "$COMPOSE_FILE" logs --tail=50
    exit 1
fi

# Show status
log_info "Deployment complete!"
docker-compose -f "$COMPOSE_FILE" ps
