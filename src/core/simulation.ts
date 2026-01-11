/**
 * Discrete event simulation engine for mesh network
 */

import { TypedEventEmitter } from '../utils/event-emitter.js';
import { createSeededRandom, type SeededRandom } from '../utils/random.js';
import { VirtualNode, type NodeConfig } from './node.js';
import { RadioMedium, type RadioMediumConfig } from './radio-medium.js';
import type { Packet } from './packet.js';
import type { LatLng } from '../utils/geo.js';
import { haversineDistance } from '../utils/geo.js';

export interface SimulationConfig {
  seed: number; // For deterministic PRNG
  tickInterval: number; // ms per tick
  realtime: boolean; // Run in realtime or fast-forward
  realtimeMultiplier: number; // Speed multiplier for realtime mode
  radioMediumConfig?: Partial<RadioMediumConfig>;
}

export interface SimulationEvent {
  time: number; // Simulation time to execute
  type: 'transmit' | 'receive' | 'timeout' | 'custom';
  data: unknown;
  handler: () => void;
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

export interface SimulationEvents {
  tick: { time: number };
  'packet:created': { packet: Packet; node: VirtualNode };
  'packet:transmitted': { packet: Packet; sender: VirtualNode; receivers: number };
  'packet:received': { packet: Packet; receiver: VirtualNode; rssi: number };
  'packet:delivered': { packet: Packet; hops: number; latency: number };
  'packet:dropped': { packet: Packet; reason: string; node: VirtualNode };
  'node:added': { node: VirtualNode };
  'node:removed': { nodeId: string };
}

const DEFAULT_CONFIG: SimulationConfig = {
  seed: Date.now(),
  tickInterval: 100,
  realtime: false,
  realtimeMultiplier: 1,
};

export class Simulation extends TypedEventEmitter<SimulationEvents> {
  readonly config: SimulationConfig;
  readonly nodes: Map<string, VirtualNode>;
  readonly radioMedium: RadioMedium;
  readonly random: SeededRandom;

  currentTime: number = 0;
  isRunning: boolean = false;

  private eventQueue: SimulationEvent[] = [];
  private intervalId?: ReturnType<typeof setInterval>;
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
   * Start the simulation
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    if (this.config.realtime) {
      const intervalMs =
        this.config.tickInterval / this.config.realtimeMultiplier;
      this.intervalId = setInterval(() => {
        this.step();
      }, intervalMs);
    }
  }

  /**
   * Stop the simulation
   */
  stop(): void {
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Execute a single simulation step
   */
  step(): void {
    // Process all events scheduled for this time
    this.processEvents();

    // Process outgoing packets from all nodes
    this.processOutgoingPackets();

    // Update all nodes
    for (const node of this.nodes.values()) {
      node.tick(this.config.tickInterval);
    }

    // Advance simulation time
    this.currentTime += this.config.tickInterval;

    // Emit tick event
    this.emit('tick', { time: this.currentTime });
  }

  /**
   * Process events scheduled for current time
   */
  private processEvents(): void {
    const eventsToProcess = this.eventQueue.filter(
      (e) => e.time <= this.currentTime
    );

    // Remove processed events
    this.eventQueue = this.eventQueue.filter(
      (e) => e.time > this.currentTime
    );

    // Execute event handlers
    for (const event of eventsToProcess) {
      event.handler();
    }
  }

  /**
   * Process outgoing packets from all nodes
   */
  private processOutgoingPackets(): void {
    for (const node of this.nodes.values()) {
      while (node.outbox.length > 0) {
        const packet = node.outbox.shift()!;

        // Register packet if it's new
        if (!this.packetRegistry.has(packet.header.id)) {
          this.packetRegistry.set(packet.header.id, packet);
          this.emit('packet:created', { packet, node });
        }

        // Transmit packet
        this.transmitPacket(node, packet);
      }
    }
  }

  /**
   * Transmit a packet from a node
   */
  private transmitPacket(sender: VirtualNode, packet: Packet): void {
    const allNodes = Array.from(this.nodes.values());
    const result = this.radioMedium.transmit(sender, packet, allNodes);

    this.emit('packet:transmitted', {
      packet,
      sender,
      receivers: result.reachedNodes.length,
    });

    // Deliver to receiving nodes
    for (const { node, rssi, delay } of result.reachedNodes) {
      if (delay > 0) {
        // Schedule delayed reception
        this.scheduleEvent({
          time: this.currentTime + delay,
          type: 'receive',
          data: { node, packet, rssi },
          handler: () => {
            this.receivePacket(node, packet, rssi);
          },
        });
      } else {
        // Immediate reception
        this.receivePacket(node, packet, rssi);
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
      const latency = this.currentTime - packet.meta.createdAt;
      const hops = packet.header.hopCount;

      this.emit('packet:delivered', { packet, hops, latency });
    }
  }

  /**
   * Schedule an event for future execution
   */
  scheduleEvent(event: SimulationEvent): void {
    this.eventQueue.push(event);
    // Keep queue sorted by time
    this.eventQueue.sort((a, b) => a.time - b.time);
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

    return node.send(toNodeId, payload);
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

  /**
   * Reset the simulation
   */
  reset(): void {
    this.stop();

    // Reset all nodes
    for (const node of this.nodes.values()) {
      node.reset();
    }

    // Clear state
    this.currentTime = 0;
    this.eventQueue = [];
    this.packetRegistry.clear();

    // Reset random number generator
    this.random.reset();
  }
}
