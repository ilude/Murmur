/**
 * Simple flooding protocol implementation for mesh networks
 */

import type { VirtualNode } from '../node.js';
import type { Packet } from '../packet.js';
import type { RoutingStrategy, RoutingDecision } from './types.js';
import { createPacket, cloneForForward } from '../packet.js';

export interface FloodingConfig {
  defaultHopLimit: number; // Default TTL for new packets
  rebroadcastDelay: number; // ms to wait before rebroadcast
  duplicateWindow: number; // ms to remember seen packet IDs
}

const DEFAULT_CONFIG: FloodingConfig = {
  defaultHopLimit: 7,
  rebroadcastDelay: 100,
  duplicateWindow: 300000, // 5 minutes
};

export class FloodingStrategy implements RoutingStrategy {
  readonly name = 'flooding';
  private config: FloodingConfig;

  constructor(config: Partial<FloodingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Handle received packet
   */
  onReceive(node: VirtualNode, packet: Packet, rssi: number): RoutingDecision {
    const { header } = packet;

    // Check if packet is for this node (or broadcast)
    const isForThisNode =
      header.destination === node.id ||
      header.destination === 'broadcast';

    // Check if packet should be forwarded
    const shouldForward =
      (header.destination === 'broadcast' || header.destination !== node.id) &&
      header.hopLimit > 0;

    // Deliver to this node if it's the destination or a broadcast
    if (isForThisNode && header.destination !== 'broadcast') {
      return {
        action: 'deliver',
        reason: 'Packet addressed to this node',
      };
    }

    // For broadcast packets, both deliver and forward
    if (header.destination === 'broadcast') {
      if (shouldForward) {
        const forwardedPacket = cloneForForward(packet, node.id);

        if (!forwardedPacket) {
          return {
            action: 'deliver',
            reason: 'Broadcast packet (hop limit exhausted)',
          };
        }

        return {
          action: 'forward',
          reason: 'Rebroadcasting packet',
          delay: this.config.rebroadcastDelay,
          modifiedPacket: forwardedPacket,
        };
      }

      return {
        action: 'deliver',
        reason: 'Broadcast packet received',
      };
    }

    // Forward if not the destination
    if (shouldForward) {
      const forwardedPacket = cloneForForward(packet, node.id);

      if (!forwardedPacket) {
        return {
          action: 'drop',
          reason: 'Hop limit exhausted',
        };
      }

      return {
        action: 'forward',
        reason: 'Forwarding to destination',
        delay: this.config.rebroadcastDelay,
        modifiedPacket: forwardedPacket,
      };
    }

    // Check if hop limit exhausted
    if (header.hopLimit <= 0) {
      return {
        action: 'drop',
        reason: 'Hop limit exhausted',
      };
    }

    return {
      action: 'drop',
      reason: 'Not for this node and cannot forward',
    };
  }

  /**
   * Create a new packet to send
   */
  onSend(node: VirtualNode, destination: string, payload: Uint8Array): Packet {
    return createPacket(
      node.id,
      destination,
      payload,
      this.config.defaultHopLimit
    );
  }

  /**
   * Periodic maintenance (not used in simple flooding)
   */
  onTick(node: VirtualNode, deltaMs: number): void {
    // No periodic maintenance needed for simple flooding
  }
}

/**
 * Create a flooding routing strategy with custom configuration
 */
export function createFloodingStrategy(
  config: Partial<FloodingConfig> = {}
): RoutingStrategy {
  return new FloodingStrategy(config);
}
