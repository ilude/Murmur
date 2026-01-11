/**
 * Virtual node implementation for mesh network simulation
 */

import type { LatLng } from '../utils/geo.js';
import type { MeshAddress } from './addressing.js';
import type { Packet } from './packet.js';
import type { RouteEntry, RoutingStrategy } from './routing/types.js';
import { latLngToAddress, formatAddress } from './addressing.js';
import { createPacket } from './packet.js';

export interface NodeConfig {
  id: string;
  position: LatLng;
  radioRange: number; // in kilometers
  txPower: number; // dBm (for link budget calculation)
  dutyCycle: number; // 0-1, percentage of time allowed to transmit
}

export interface NodeStats {
  packetsReceived: number;
  packetsSent: number;
  packetsDropped: number;
  packetsForwarded: number;
  duplicatesIgnored: number;
}

export class VirtualNode {
  readonly id: string;
  readonly config: NodeConfig;
  readonly address: MeshAddress;

  // State
  position: LatLng;
  seenPacketIds: Set<string>;
  routingTable: Map<string, RouteEntry>;
  inbox: Packet[];
  outbox: Packet[];

  // Metrics
  stats: NodeStats;

  // Routing strategy
  private routingStrategy?: RoutingStrategy;

  // Duty cycle tracking
  private transmitTime: number = 0; // Total time spent transmitting
  private simulationTime: number = 0; // Total simulation time

  constructor(config: NodeConfig) {
    this.id = config.id;
    this.config = config;
    this.position = config.position;
    this.address = latLngToAddress(config.position.lat, config.position.lng);

    this.seenPacketIds = new Set();
    this.routingTable = new Map();
    this.inbox = [];
    this.outbox = [];

    this.stats = {
      packetsReceived: 0,
      packetsSent: 0,
      packetsDropped: 0,
      packetsForwarded: 0,
      duplicatesIgnored: 0,
    };
  }

  /**
   * Set the routing strategy for this node
   */
  setRoutingStrategy(strategy: RoutingStrategy): void {
    this.routingStrategy = strategy;
  }

  /**
   * Get the formatted mesh address
   */
  getFormattedAddress(): string {
    return formatAddress(this.address);
  }

  /**
   * Receive a packet from the radio medium
   */
  receive(packet: Packet, rssi: number): void {
    this.stats.packetsReceived++;

    // Check for duplicates
    if (this.seenPacketIds.has(packet.header.id)) {
      this.stats.duplicatesIgnored++;
      return;
    }

    // Mark as seen
    this.seenPacketIds.add(packet.header.id);

    // Add to inbox
    this.inbox.push(packet);

    // Let routing strategy decide what to do
    if (this.routingStrategy) {
      const decision = this.routingStrategy.onReceive(this, packet, rssi);

      switch (decision.action) {
        case 'deliver':
          // Packet is for this node, keep in inbox
          break;

        case 'forward':
          // Schedule for forwarding
          const forwardPacket = decision.modifiedPacket ?? packet;
          if (decision.delay !== undefined && decision.delay > 0) {
            // TODO: Implement delayed forwarding
            this.outbox.push(forwardPacket);
          } else {
            this.outbox.push(forwardPacket);
          }
          this.stats.packetsForwarded++;
          break;

        case 'drop':
          // Drop the packet
          this.stats.packetsDropped++;
          break;
      }
    }
  }

  /**
   * Send a new packet
   */
  send(destination: string, payload: Uint8Array): string {
    if (!this.routingStrategy) {
      throw new Error('No routing strategy set');
    }

    const packet = this.routingStrategy.onSend(this, destination, payload);
    this.outbox.push(packet);
    this.stats.packetsSent++;

    return packet.header.id;
  }

  /**
   * Check if node can transmit (duty cycle check)
   */
  canTransmit(): boolean {
    if (this.simulationTime === 0) {
      return true;
    }

    const currentDutyCycle = this.transmitTime / this.simulationTime;
    return currentDutyCycle < this.config.dutyCycle;
  }

  /**
   * Record transmission time
   */
  recordTransmission(durationMs: number): void {
    this.transmitTime += durationMs;
  }

  /**
   * Periodic tick for routing protocol maintenance
   */
  tick(deltaMs: number): void {
    this.simulationTime += deltaMs;

    if (this.routingStrategy) {
      this.routingStrategy.onTick(this, deltaMs);
    }

    // Clean up old seen packet IDs (older than 5 minutes)
    // In a real implementation, this would use a time-based cache
    if (this.seenPacketIds.size > 1000) {
      // Simple size-based cleanup for now
      const idsArray = Array.from(this.seenPacketIds);
      const toRemove = idsArray.slice(0, Math.floor(idsArray.length / 2));
      toRemove.forEach(id => this.seenPacketIds.delete(id));
    }
  }

  /**
   * Reset node state
   */
  reset(): void {
    this.seenPacketIds.clear();
    this.routingTable.clear();
    this.inbox = [];
    this.outbox = [];
    this.transmitTime = 0;
    this.simulationTime = 0;

    this.stats = {
      packetsReceived: 0,
      packetsSent: 0,
      packetsDropped: 0,
      packetsForwarded: 0,
      duplicatesIgnored: 0,
    };
  }

  /**
   * Update node position (recalculates address)
   */
  updatePosition(position: LatLng): void {
    this.position = position;
    const newAddress = latLngToAddress(position.lat, position.lng);
    // Update address object in place
    Object.assign(this.address, newAddress);
  }
}
