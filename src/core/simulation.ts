/**
 * Discrete event simulation engine for mesh network
 */

import { TypedEventEmitter } from '../utils/event-emitter.js';
import { createSeededRandom, type SeededRandom } from '../utils/random.js';
import { VirtualNode, type NodeConfig } from './node.js';
import { RadioMedium, type RadioMediumConfig } from './radio-medium.js';
import type { Packet } from './packet.js';
import type { LatLng } from '../utils/geo.js';
import {
  LinkGraph,
  LinkPrecomputer,
  type ComputeProgress,
} from '../graph/index.js';

export interface GraphConfig {
  maxLinkDistanceKm?: number;  // Maximum distance for precomputed links
  useTerrainLOS?: boolean;     // Use terrain-aware LOS for precomputation
  staleThresholdMs?: number;   // Time before links are considered stale
}

export interface SimulationConfig {
  seed: number; // For deterministic PRNG
  radioMediumConfig?: Partial<RadioMediumConfig>;
  enableGraph?: boolean;       // Enable link graph precomputation
  graphConfig?: GraphConfig;
  syncMode?: boolean;          // Synchronous mode (for testing, no animation delays)
}

export interface NetworkTopology {
  nodes: Array<{
    id: string;
    position: LatLng;
    neighbors: string[];
  }>;
  links: Array<{
    from: string;
    to: string;
    distance: number;
    rssi: number;
  }>;
}

export interface SimulationStats {
  totalPackets: number;
  deliveredPackets: number;
  droppedPackets: number;
  averageHops: number;
  averageLatency: number;
  deliveryRate: number;
}

export type SimulationEvents = {
  'packet:created': { packet: Packet; node: VirtualNode };
  'packet:transmitted': { packet: Packet; sender: VirtualNode; receivers: number };
  'packet:received': { packet: Packet; receiver: VirtualNode; rssi: number };
  'packet:delivered': { packet: Packet; hops: number; latency: number };
  'packet:dropped': { packet: Packet; reason: string; node: VirtualNode };
  'node:added': { node: VirtualNode };
  'node:removed': { nodeId: string };
};

const DEFAULT_CONFIG: SimulationConfig = {
  seed: Date.now(),
  enableGraph: false,
};

export class Simulation extends TypedEventEmitter<SimulationEvents> {
  readonly config: SimulationConfig;
  readonly nodes: Map<string, VirtualNode>;
  readonly radioMedium: RadioMedium;
  readonly random: SeededRandom;

  // Graph-related members
  readonly linkGraph: LinkGraph;
  readonly precomputer: LinkPrecomputer | undefined;

  private packetRegistry: Map<string, Packet> = new Map();

  constructor(config: Partial<SimulationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nodes = new Map();
    this.random = createSeededRandom(this.config.seed);
    this.radioMedium = new RadioMedium(
      this.config.radioMediumConfig,
      this.random.fork()
    );

    // Initialize link graph
    this.linkGraph = new LinkGraph();

    // Initialize precomputer if graph is enabled
    if (this.config.enableGraph) {
      const gc = this.config.graphConfig ?? {};
      this.precomputer = new LinkPrecomputer(
        this.radioMedium,
        this.linkGraph,
        {
          maxDistanceKm: gc.maxLinkDistanceKm ?? 20,
          useTerrainLOS: gc.useTerrainLOS ?? false,
          staleThresholdMs: gc.staleThresholdMs ?? 5 * 60 * 1000,
        }
      );
    }
  }

  /**
   * Add a node to the simulation
   */
  addNode(config: NodeConfig): VirtualNode {
    if (this.nodes.has(config.id)) {
      throw new Error(`Node with id ${config.id} already exists`);
    }

    const node = new VirtualNode(config);
    this.nodes.set(config.id, node);

    this.emit('node:added', { node });

    return node;
  }

  /**
   * Remove a node from the simulation
   */
  removeNode(id: string): void {
    if (!this.nodes.has(id)) {
      throw new Error(`Node with id ${id} does not exist`);
    }

    this.nodes.delete(id);
    this.emit('node:removed', { nodeId: id });
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): VirtualNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Transmit a packet from a node (with visual cascade delay for forwarding)
   */
  transmitPacket(sender: VirtualNode, packet: Packet): void {
    // Register packet if it's new
    if (!this.packetRegistry.has(packet.header.id)) {
      this.packetRegistry.set(packet.header.id, packet);
      this.emit('packet:created', { packet, node: sender });
    }
    const allNodes = Array.from(this.nodes.values());
    const result = this.radioMedium.transmit(sender, packet, allNodes);

    this.emit('packet:transmitted', {
      packet,
      sender,
      receivers: result.reachedNodes.length,
    });

    // Deliver to receiving nodes immediately (they decide whether to forward)
    for (const { node, rssi } of result.reachedNodes) {
      this.receivePacket(node, packet, rssi);
    }

    // Schedule forwarding with delay for visual cascade effect
    this.scheduleForwardedPackets();
  }

  /**
   * Schedule forwarded packets with delay for visual cascade
   */
  private scheduleForwardedPackets(): void {
    for (const node of this.nodes.values()) {
      while (node.outbox.length > 0) {
        const packet = node.outbox.shift()!;

        if (this.config.syncMode) {
          // Synchronous mode for testing - transmit immediately
          this.transmitPacket(node, packet);
        } else {
          // Async mode for visual cascade - delay forwarding
          const delay = packet.meta.forwardDelay ?? 100;
          const forwardingNode = node; // Capture node reference
          setTimeout(() => {
            this.transmitPacket(forwardingNode, packet);
          }, delay);
        }
      }
    }
  }

  /**
   * Deliver packet to a receiving node
   */
  private receivePacket(
    receiver: VirtualNode,
    packet: Packet,
    rssi: number
  ): void {
    receiver.receive(packet, rssi);

    this.emit('packet:received', { packet, receiver, rssi });

    // Check if packet was delivered to its destination
    if (
      packet.header.destination === receiver.id ||
      packet.header.destination === 'broadcast'
    ) {
      const latency = Date.now() - packet.meta.createdAt;
      const hops = packet.header.hopCount;

      this.emit('packet:delivered', { packet, hops, latency });
    }
  }

  /**
   * Inject a packet into the simulation
   */
  injectPacket(
    fromNodeId: string,
    toNodeId: string,
    payload: Uint8Array
  ): string {
    const node = this.getNode(fromNodeId);
    if (!node) {
      throw new Error(`Node ${fromNodeId} not found`);
    }

    const packetId = node.send(toNodeId, payload);

    // Immediately transmit the packet
    const packet = node.outbox.shift();
    if (packet) {
      this.transmitPacket(node, packet);
    }

    return packetId;
  }

  /**
   * Get network topology
   */
  getTopology(): NetworkTopology {
    const nodes = Array.from(this.nodes.values());
    const links: NetworkTopology['links'] = [];

    const topologyNodes = nodes.map((node) => {
      const neighbors = this.radioMedium
        .getNeighbors(node, nodes)
        .map((n) => n.id);

      // Build links
      for (const neighbor of this.radioMedium.getNeighbors(node, nodes)) {
        const linkBudget = this.radioMedium.getLinkBudget(node, neighbor);
        links.push({
          from: node.id,
          to: neighbor.id,
          distance: linkBudget.distance,
          rssi: linkBudget.rssi,
        });
      }

      return {
        id: node.id,
        position: node.position,
        neighbors,
      };
    });

    return {
      nodes: topologyNodes,
      links,
    };
  }

  /**
   * Get simulation statistics
   */
  getStats(): SimulationStats {
    let totalPackets = 0;
    let deliveredPackets = 0;
    let droppedPackets = 0;
    let totalHops = 0;

    for (const node of this.nodes.values()) {
      totalPackets += node.stats.packetsSent;
      droppedPackets += node.stats.packetsDropped;
    }

    // Count delivered packets from packet registry
    for (const packet of this.packetRegistry.values()) {
      if (packet.meta.deliveredAt !== undefined) {
        deliveredPackets++;
        totalHops += packet.header.hopCount;
      }
    }

    const averageHops = deliveredPackets > 0 ? totalHops / deliveredPackets : 0;
    const deliveryRate = totalPackets > 0 ? deliveredPackets / totalPackets : 0;

    // Calculate average latency
    let totalLatency = 0;
    for (const packet of this.packetRegistry.values()) {
      if (packet.meta.deliveredAt !== undefined) {
        totalLatency += packet.meta.deliveredAt - packet.meta.createdAt;
      }
    }
    const averageLatency =
      deliveredPackets > 0 ? totalLatency / deliveredPackets : 0;

    return {
      totalPackets,
      deliveredPackets,
      droppedPackets,
      averageHops,
      averageLatency,
      deliveryRate,
    };
  }

  // ============ Graph Operations ============

  /**
   * Precompute all link budgets between nodes
   * This should be called after adding all nodes for efficient simulation
   */
  async precomputeAllLinks(
    onProgress?: (progress: ComputeProgress) => void
  ): Promise<number> {
    if (!this.precomputer) {
      throw new Error('Graph precomputation is not enabled. Set enableGraph: true in config.');
    }

    const nodes = Array.from(this.nodes.values());
    return await this.precomputer.computeAllLinks(nodes, onProgress);
  }

  /**
   * Recompute links for a specific node (e.g., after it moves)
   */
  async recomputeNodeLinks(nodeId: string): Promise<number> {
    if (!this.precomputer) {
      return 0;
    }

    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const allNodes = Array.from(this.nodes.values());
    return await this.precomputer.recomputeNodeLinks(node, allNodes);
  }

  /**
   * Find optimal path between two nodes using precomputed link data
   * Returns array of node IDs from source to destination
   */
  findOptimalPath(from: string, to: string): string[] {
    return this.linkGraph.findPath(from, to);
  }

  /**
   * Get cached link budget between two nodes
   */
  getCachedLinkBudget(from: string, to: string) {
    return this.linkGraph.getLink(from, to);
  }

  /**
   * Get graph statistics
   */
  getGraphStats() {
    return this.precomputer?.getStats() ?? {
      nodeCount: 0,
      linkCount: 0,
      staleCount: 0,
    };
  }

  /**
   * Reset the simulation
   */
  reset(): void {
    // Reset all nodes
    for (const node of this.nodes.values()) {
      node.reset();
    }

    // Clear state
    this.packetRegistry.clear();

    // Clear graph data
    this.linkGraph.clear();

    // Reset random number generator
    this.random.reset();
  }
}
