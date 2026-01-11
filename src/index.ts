/**
 * Ghostwave - Mesh Network Simulator
 * Main entry point
 */

// Core exports
export { Simulation } from './core/simulation.js';
export type {
  SimulationConfig,
  SimulationEvents,
  NetworkTopology,
  SimulationStats,
  GraphConfig,
} from './core/simulation.js';

export { VirtualNode } from './core/node.js';
export type { NodeConfig, NodeStats } from './core/node.js';

export { RadioMedium } from './core/radio-medium.js';
export type {
  RadioMediumConfig,
  TerrainConfig,
  LinkBudget,
  TransmissionResult,
} from './core/radio-medium.js';

export {
  createPacket,
  cloneForForward,
  serializePacket,
  deserializePacket,
} from './core/packet.js';
export type { Packet, PacketHeader, PacketMeta } from './core/packet.js';

export {
  latLngToAddress,
  addressToLatLng,
  formatAddress,
  parseAddress,
  getRegionBounds,
  getCellBounds,
} from './core/addressing.js';
export type { MeshAddress, AddressingConfig } from './core/addressing.js';

// Routing exports
export { createFloodingStrategy } from './core/routing/flooding.js';
export type { FloodingConfig } from './core/routing/flooding.js';
export type {
  RoutingStrategy,
  RoutingDecision,
  RouteEntry,
} from './core/routing/types.js';

// Utility exports
export {
  haversineDistance,
  webMercatorToLatLng,
  latLngToWebMercator,
  bearing,
  destination,
  isInBounds,
  interpolatePoints,
} from './utils/geo.js';
export type { LatLng, LatLngBounds } from './utils/geo.js';

export { createSeededRandom } from './utils/random.js';
export type { SeededRandom } from './utils/random.js';

export { TypedEventEmitter } from './utils/event-emitter.js';
export type { EventEmitter, EventHandler } from './utils/event-emitter.js';

// Terrain exports
export { ElevationCache, ElevationApi, LOSCalculator } from './terrain/index.js';
export type {
  ElevationCacheConfig,
  ElevationApiConfig,
  ElevationPoint,
  LOSConfig,
  LOSResult,
  TerrainProfilePoint,
} from './terrain/index.js';

// Graph exports
export {
  LinkGraph,
  GraphPersistence,
  LinkPrecomputer,
} from './graph/index.js';
export type {
  NodeData,
  LinkEdgeData,
  NeighborInfo,
  SerializedGraph,
  StoredNode,
  StoredLink,
  GraphPersistenceConfig,
  LinkPrecomputerConfig,
  ComputeProgress,
  ProgressCallback,
} from './graph/index.js';
