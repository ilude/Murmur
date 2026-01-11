.PHONY: help install test test-coverage dev build clean start type-check lint all

# Default target
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(CYAN)Ghostwave - Mesh Network Simulator$(NC)"
	@echo ""
	@echo "$(GREEN)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Quick start:$(NC)"
	@echo "  make install  # Install dependencies"
	@echo "  make dev      # Start dev server"
	@echo "  make test     # Run tests"

install: ## Install dependencies with bun
	@echo "$(GREEN)Installing dependencies...$(NC)"
	@command -v bun >/dev/null 2>&1 || { echo "$(RED)Error: bun is not installed. Install it from https://bun.sh$(NC)"; exit 1; }
	bun install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

dev: ## Start development server
	@echo "$(GREEN)Starting development server...$(NC)"
	@echo "$(CYAN)Open http://localhost:3000 in your browser$(NC)"
	bun run dev

build: ## Build for production
	@echo "$(GREEN)Building for production...$(NC)"
	bun run build
	@echo "$(GREEN)✓ Build complete$(NC)"

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	bun test

test-coverage: ## Run tests with coverage report
	@echo "$(GREEN)Running tests with coverage...$(NC)"
	bun run test:coverage

test-watch: ## Run tests in watch mode
	@echo "$(GREEN)Running tests in watch mode...$(NC)"
	bun run test

type-check: ## Run TypeScript type checking
	@echo "$(GREEN)Type checking...$(NC)"
	bun run type-check

preview: build ## Build and preview production bundle
	@echo "$(GREEN)Starting preview server...$(NC)"
	bun run preview

clean: ## Clean build artifacts and node_modules
	@echo "$(YELLOW)Cleaning...$(NC)"
	rm -rf dist
	rm -rf coverage
	rm -rf node_modules
	rm -rf .vite
	@echo "$(GREEN)✓ Clean complete$(NC)"

reset: clean install ## Clean and reinstall everything
	@echo "$(GREEN)✓ Reset complete$(NC)"

start: dev ## Alias for 'make dev'

all: install test build ## Install, test, and build
	@echo "$(GREEN)✓ All tasks complete$(NC)"

info: ## Show project information
	@echo "$(CYAN)Ghostwave - Mesh Network Simulator$(NC)"
	@echo ""
	@echo "$(GREEN)Project Info:$(NC)"
	@echo "  Name:        Ghostwave"
	@echo "  Description: TypeScript-based mesh network simulator"
	@echo "  Tech Stack:  TypeScript, Vite, Vitest, Leaflet, Bun"
	@echo "  Coverage:    >90% code coverage"
	@echo "  Tests:       140+ test cases"
	@echo ""
	@echo "$(GREEN)Quick Commands:$(NC)"
	@echo "  make install      - Install all dependencies"
	@echo "  make dev          - Start development server (http://localhost:3000)"
	@echo "  make test         - Run all tests"
	@echo "  make test-coverage - Run tests with coverage report"
	@echo "  make build        - Build for production"
	@echo ""
	@echo "$(YELLOW)Requirements:$(NC)"
	@echo "  - Bun 1.0+ (https://bun.sh)"

check-deps: ## Check if required dependencies are installed
	@echo "$(GREEN)Checking dependencies...$(NC)"
	@command -v bun >/dev/null 2>&1 || { echo "$(RED)✗ Bun is not installed. Install from https://bun.sh$(NC)"; exit 1; }
	@echo "$(GREEN)✓ Bun: $$(bun --version)$(NC)"
	@echo "$(GREEN)✓ All dependencies satisfied$(NC)"

setup: check-deps install ## Full setup for new machine
	@echo ""
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo ""
	@echo "$(CYAN)Next steps:$(NC)"
	@echo "  1. Run 'make dev' to start the development server"
	@echo "  2. Open http://localhost:3000 in your browser"
	@echo "  3. Click on the map to add nodes"
	@echo "  4. Press 'Broadcast Test' to see packets propagate"
	@echo ""
