#!/bin/bash
set -e

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════╗"
echo "║                                           ║"
echo "║        Ghostwave Setup Script             ║"
echo "║   Mesh Network Simulator                  ║"
echo "║                                           ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# Check Node.js
echo -e "${YELLOW}Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo -e "${YELLOW}Please install Node.js 20+ from https://nodejs.org${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js: ${NODE_VERSION}${NC}"

# Check pnpm
echo -e "${YELLOW}Checking pnpm...${NC}"
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}pnpm is not installed. Installing...${NC}"
    npm install -g pnpm
    echo -e "${GREEN}✓ pnpm installed${NC}"
else
    PNPM_VERSION=$(pnpm --version)
    echo -e "${GREEN}✓ pnpm: ${PNPM_VERSION}${NC}"
fi

# Install dependencies
echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"
pnpm install

# Run tests to verify installation
echo ""
echo -e "${YELLOW}Running tests to verify installation...${NC}"
pnpm test -- --run

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                           ║${NC}"
echo -e "${GREEN}║          ✓ Setup Complete!                ║${NC}"
echo -e "${GREEN}║                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo ""
echo -e "  1. Start the dev server:"
echo -e "     ${GREEN}make dev${NC} or ${GREEN}pnpm dev${NC}"
echo ""
echo -e "  2. Open in your browser:"
echo -e "     ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "  3. Interact with the simulator:"
echo -e "     • Click on map to add nodes"
echo -e "     • Press 'Broadcast Test' to send packets"
echo -e "     • Watch packets propagate through mesh"
echo -e "     • Toggle options in control panel"
echo ""
echo -e "${YELLOW}Other useful commands:${NC}"
echo -e "  ${GREEN}make help${NC}          - Show all available commands"
echo -e "  ${GREEN}make test${NC}          - Run tests"
echo -e "  ${GREEN}make test-coverage${NC} - Run tests with coverage"
echo -e "  ${GREEN}make build${NC}         - Build for production"
echo ""
