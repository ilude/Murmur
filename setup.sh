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

# Check Bun
echo -e "${YELLOW}Checking Bun...${NC}"
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}Bun is not installed. Installing...${NC}"

    # Detect OS and install Bun
    if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]]; then
        curl -fsSL https://bun.sh/install | bash

        # Source the bun path
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"

        echo -e "${GREEN}✓ Bun installed${NC}"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        echo -e "${RED}Please install Bun manually on Windows from https://bun.sh${NC}"
        echo -e "${YELLOW}Run: powershell -c \"irm bun.sh/install.ps1|iex\"${NC}"
        exit 1
    else
        echo -e "${RED}Unsupported OS. Please install Bun manually from https://bun.sh${NC}"
        exit 1
    fi
else
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}✓ Bun: v${BUN_VERSION}${NC}"
fi

# Install dependencies
echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"
bun install

# Run tests to verify installation
echo ""
echo -e "${YELLOW}Running tests to verify installation...${NC}"
bun test

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
echo -e "     ${GREEN}make dev${NC} or ${GREEN}bun run dev${NC}"
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
