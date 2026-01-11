/**
 * Routing strategy interface for mesh network protocols
 */

import type { Packet } from '../packet.js';
import type { VirtualNode } from '../node.js';

export interface RoutingDecision {
  action: 'deliver' | 'forward' | 'drop';
  reason: string;
  delay?: number; // Delay in ms before forwarding
  modifiedPacket?: Packet; // If packet should be modified before forwarding
}

export interface RoutingStrategy {
  readonly name: string;

  /**
   * Called when a node receives a packet
   */
  onReceive(node: VirtualNode, packet: Packet, rssi: number): RoutingDecision;

  /**
   * Called when a node wants to send a new packet
   */
  onSend(node: VirtualNode, destination: string, payload: Uint8Array): Packet;

  /**
   * Called periodically for routing protocol maintenance
   */
  onTick(node: VirtualNode, deltaMs: number): void;
}

export interface RouteEntry {
  destination: string;
  nextHop: string;
  hopCount: number;
  lastUpdate: number;
}
