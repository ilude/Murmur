# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Murmur is a TypeScript mesh network simulator for LoRa/Meshtastic-style networks. It features realistic RF propagation simulation with an interactive Leaflet-based map UI.

## Commands

```bash
# Development
make dev              # Start Vite dev server at http://localhost:3000
make test             # Run all tests with Vitest
bun test <path>       # Run specific test file
bun test --watch      # Run tests in watch mode
make test-coverage    # Run tests with 90% coverage thresholds
make type-check       # TypeScript type checking

# Build
make build            # Production build (tsc + vite build)
make clean            # Remove dist/, coverage/, node_modules/

# Setup
make setup            # Full setup (check deps + install)
bun install           # Install dependencies
```

## Architecture

### Core Simulation Engine (`src/core/`)

The simulation uses a discrete-event model with deterministic (seeded) PRNG for reproducible results:

- **Simulation**: Main orchestrator managing nodes, the event queue, and packet lifecycle. Emits typed events (`packet:created`, `packet:transmitted`, `packet:received`, `packet:delivered`, `packet:dropped`).
- **VirtualNode**: Represents a mesh node with inbox/outbox queues, duty cycle tracking, and pluggable routing strategy. Handles duplicate detection via `seenPacketIds`.
- **RadioMedium**: RF propagation using log-distance path loss model. Calculates RSSI, link budgets, and optional log-normal fading. Supports async terrain-aware LOS checks.
- **Packet**: Message structure with header (id, source, destination, hopLimit, hopCount) and metadata (timestamps). Use `createPacket()` and `cloneForForward()` helpers.

### Routing (`src/core/routing/`)

Implements the `RoutingStrategy` interface with three callbacks: `onReceive()`, `onSend()`, `onTick()`. Currently provides `FloodingStrategy` with configurable hop limits and rebroadcast delay. The strategy pattern allows adding new protocols.

### Terrain Awareness (`src/terrain/`)

Optional LOS (line-of-sight) calculations using elevation data:
- `ElevationApi`: Fetches elevation from Open-Elevation API
- `ElevationCache`: Caches elevation data
- `LOSCalculator`: Checks Fresnel zone clearance between nodes

Enable via `radioMediumConfig: { enableTerrain: true }`.

### UI Layer (`src/ui/`)

Browser-only Leaflet integration (excluded from library build and test coverage):
- `map.ts`: Leaflet map initialization
- `node-layer.ts`: Node markers and connection lines
- `packet-animation.ts`: Animated packet propagation circles
- `controls.ts`: Simulation controls (play/pause/step/speed)
- `node-list-panel.ts`: Node listing UI

### Utilities (`src/utils/`)

- `geo.ts`: Haversine distance, Web Mercator projection, bearing/destination calculations
- `random.ts`: Seeded PRNG with `.fork()` for independent streams
- `event-emitter.ts`: Type-safe event emitter base class

## Key Patterns

### Path Aliases
Use `@/` alias for imports from `src/`:
```typescript
import { Simulation } from '@/core/simulation';
```

### Event-Driven Flow
Subscribe to simulation events for packet lifecycle:
```typescript
sim.on('packet:delivered', ({ packet, hops, latency }) => { ... });
```

### Deterministic Testing
Always pass a seed for reproducible tests:
```typescript
const sim = new Simulation({ seed: 12345, realtime: false });
```

### Routing Strategy Setup
Nodes require a routing strategy before sending:
```typescript
node.setRoutingStrategy(createFloodingStrategy({ defaultHopLimit: 7 }));
```

## Test Structure

Tests mirror source structure in `tests/`. Integration tests in `tests/integration.test.ts` cover multi-node scenarios including multi-hop delivery, broadcast, hop limits, network partitions, and duplicate detection.
