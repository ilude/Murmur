/**
 * Graph module for precomputed radio link data
 *
 * This module provides:
 * - LinkGraph: In-memory graph for fast neighbor queries and pathfinding
 * - GraphPersistence: IndexedDB persistence layer using Dexie
 * - LinkPrecomputer: Computes and caches link budgets between nodes
 */

export {
  LinkGraph,
  type NodeData,
  type LinkEdgeData,
  type NeighborInfo,
  type SerializedGraph,
} from './link-graph.js';

export {
  GraphPersistence,
  type StoredNode,
  type StoredLink,
  type GraphPersistenceConfig,
} from './graph-persistence.js';

export {
  LinkPrecomputer,
  type LinkPrecomputerConfig,
  type ComputeProgress,
  type ProgressCallback,
} from './link-precomputer.js';
