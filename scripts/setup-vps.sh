#!/bin/bash
set -e

# Playwright Render API - Initial VPS Setup Script
# Run this once on a fresh Hostinger VPS

# Configuration
APP_NAME="playwright-render-api"
APP_DIR="/opt/$APP_NAME"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (sudo)"
    exit 1
fi

log_info "Starting VPS setup for $APP_NAME..."

# Update system
log_info "Updating system packages..."
apt-get update && apt-get upgrade -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    log_info "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
else
    log_info "Docker already installed"
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    log_info "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
else
    log_info "Docker Compose already installed"
fi

# Install useful tools
log_info "Installing useful tools..."
apt-get install -y curl git htop ncdu

# Create application directory
log_info "Creating application directory..."
mkdir -p "$APP_DIR"

# Set up firewall (if ufw is available)
if command -v ufw &> /dev/null; then
    log_info "Configuring firewall..."
    ufw allow 22/tcp   # SSH
    ufw allow 80/tcp   # HTTP (for reverse proxy)
    ufw allow 443/tcp  # HTTPS (for reverse proxy)
    # Note: Port 3001 should NOT be exposed directly, use reverse proxy
    ufw --force enable
else
    log_warn "ufw not installed, skipping firewall configuration"
fi

# Create systemd service for auto-restart
log_info "Creating systemd service..."
cat > /etc/systemd/system/$APP_NAME.service << EOF
[Unit]
Description=Playwright Render API
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $APP_NAME

log_info "VPS setup complete!"
log_info ""
log_info "Next steps:"
log_info "1. Clone your repository to $APP_DIR"
log_info "2. Copy .env.example to .env and configure it"
log_info "3. Run: sudo ./scripts/deploy.sh --build"
log_info ""
log_info "Or manually:"
log_info "  cd $APP_DIR"
log_info "  cp .env.example .env"
log_info "  nano .env  # Edit configuration"
log_info "  docker-compose up -d --build"
