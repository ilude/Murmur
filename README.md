# Ghostwave - Mesh Network Simulator

A TypeScript-based mesh network simulator for LoRa/Meshtastic-style networks with realistic RF propagation.

![Mesh Network Simulation](https://img.shields.io/badge/TypeScript-5.9-blue) ![Tests](https://img.shields.io/badge/tests-140%20passing-green) ![Coverage](https://img.shields.io/badge/coverage-90%25-green)

## Features

- **Interactive UI**: Leaflet-based map with drag-and-drop nodes
- **Visual Animations**: Watch packets propagate through the mesh network
- **Isomorphic Core**: Works in Node.js and browsers
- **Realistic RF Simulation**: Path loss models, fading, and link budgets
- **Geographic Addressing**: Grid-based mesh addresses derived from coordinates
- **Routing Protocols**: Simple flooding protocol (extensible for more)
- **Deterministic Replay**: Seeded PRNG for reproducible simulations
- **Event-Driven**: Listen to packet lifecycle events
- **Comprehensive Tests**: >90% code coverage with unit and integration tests

## 🚀 Quick Start (New Machine)

### Option 1: Automated Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd Murmur

# Run automated setup script
./setup.sh
```

The setup script will:
- ✓ Check Node.js installation
- ✓ Install pnpm if needed
- ✓ Install all dependencies
- ✓ Run tests to verify installation
- ✓ Show next steps

### Option 2: Using Make

```bash
# Clone the repository
git clone <your-repo-url>
cd Murmur

# Install dependencies and verify
make setup

# Start the dev server
make dev
```

### Option 3: Manual Setup

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install dependencies
pnpm install

# Start the dev server
pnpm dev
```

Then open **http://localhost:3000** in your browser!

## 📋 Requirements

- **Node.js** 20 or higher
- **pnpm** (will be installed automatically by setup script)
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 🎮 Using the Interactive UI

Once the dev server is running at http://localhost:3000:

1. **Add Nodes**: Click anywhere on the map to place mesh network nodes
2. **See Connections**: Green dashed lines show nodes within radio range
3. **Send Packets**: Click "Broadcast Test" to send a test message
4. **Watch Propagation**: See expanding circles as packets transmit
5. **Control Simulation**:
   - ▶️ Play - Run continuously
   - ⏸ Pause - Stop simulation
   - ⏭ Step - Advance one tick
   - 🎚️ Speed - Adjust from 0.1x to 100x

## 📚 Makefile Commands

```bash
make help           # Show all available commands
make install        # Install dependencies
make dev            # Start development server
make test           # Run all tests
make test-coverage  # Run tests with coverage report
make build          # Build for production
make clean          # Clean build artifacts
make setup          # Full setup for new machine
make info           # Show project information
```

## 💻 Programmatic API Usage

If you want to use Ghostwave as a library (without the UI):

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