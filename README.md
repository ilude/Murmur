# Ghostwave - Mesh Network Simulator

A TypeScript-based mesh network simulator for LoRa/Meshtastic-style networks with realistic RF propagation.

## Features

- **Isomorphic Core**: Works in Node.js and browsers
- **Realistic RF Simulation**: Path loss models, fading, and link budgets
- **Geographic Addressing**: Grid-based mesh addresses derived from coordinates
- **Routing Protocols**: Simple flooding protocol (extensible for more)
- **Deterministic Replay**: Seeded PRNG for reproducible simulations
- **Event-Driven**: Listen to packet lifecycle events
- **Comprehensive Tests**: >90% code coverage with unit and integration tests

## Installation

```bash
pnpm install
```

## Quick Start

```typescript
import { Simulation, createFloodingStrategy } from 'ghostwave';

// Create simulation
const sim = new Simulation({
  seed: 12345,
  tickInterval: 100,
  realtime: false,
});

// Add nodes
const nodeA = sim.addNode({
  id: 'node-a',
  position: { lat: 47.6062, lng: -122.3321 },
  radioRange: 10,
  txPower: 20,
  dutyCycle: 0.1,
});

const nodeB = sim.addNode({
  id: 'node-b',
  position: { lat: 47.6092, lng: -122.3421 },
  radioRange: 10,
  txPower: 20,
  dutyCycle: 0.1,
});

// Set routing strategy
nodeA.setRoutingStrategy(createFloodingStrategy());
nodeB.setRoutingStrategy(createFloodingStrategy());

// Listen for events
sim.on('packet:delivered', ({ packet, hops, latency }) => {
  console.log(`Packet ${packet.header.id} delivered in ${hops} hops, ${latency}ms`);
});

// Send message
sim.injectPacket('node-a', 'node-b', new TextEncoder().encode('Hello!'));

// Run simulation
sim.step();
```

## Architecture

### Core Components

- **VirtualNode**: Simulated mesh network node with radio capabilities
- **RadioMedium**: RF propagation simulation with configurable path loss
- **Packet**: Message structure with serialization
- **Simulation**: Discrete-event simulation engine
- **Addressing**: Geographic coordinate to mesh address mapping
- **Routing**: Pluggable routing strategies

### Utilities

- **Geo**: Haversine distance, Web Mercator projection
- **Random**: Seeded PRNG for deterministic simulation
- **EventEmitter**: Type-safe event system

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test -- --watch
```

## Building

```bash
# Build library
pnpm build

# Type check
pnpm type-check
```

## Project Structure

```
ghostwave/
├── src/
│   ├── core/               # Core simulation engine
│   │   ├── node.ts
│   │   ├── packet.ts
│   │   ├── radio-medium.ts
│   │   ├── simulation.ts
│   │   ├── addressing.ts
│   │   └── routing/
│   │       ├── flooding.ts
│   │       └── types.ts
│   ├── utils/              # Utilities
│   │   ├── geo.ts
│   │   ├── random.ts
│   │   └── event-emitter.ts
│   └── index.ts            # Main entry point
├── tests/                  # Test suites
│   ├── core/
│   ├── utils/
│   └── integration.test.ts
└── package.json
```

## License

MIT