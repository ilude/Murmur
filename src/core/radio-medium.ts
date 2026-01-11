/**
 * Radio medium simulation for RF propagation between nodes
 */

import type { VirtualNode } from './node.js';
import type { Packet } from './packet.js';
import type { SeededRandom } from '../utils/random.js';
import { haversineDistance } from '../utils/geo.js';

export interface RadioMediumConfig {
  // Propagation model
  pathLossExponent: number; // Free space = 2, urban = 2.7-3.5
  referenceDistance: number; // meters (typically 1m)
  referenceLoss: number; // dB at reference distance

  // Reception
  rxSensitivity: number; // dBm, typical LoRa: -137 to -120

  // Simulation options
  enableCollisions: boolean; // Model packet collisions
  enableFading: boolean; // Add random fading
  fadingSigma: number; // Standard deviation for log-normal fading
}

export interface LinkBudget {
  distance: number; // km
  pathLoss: number; // dB
  rssi: number; // dBm at receiver
  snr: number; // Signal to noise ratio estimate
  canReceive: boolean;
}

export interface TransmissionResult {
  reachedNodes: Array<{
    node: VirtualNode;
    rssi: number;
    delay: number; // propagation delay in ms
  }>;
  collisions: string[]; // Node IDs that experienced collision
}

const DEFAULT_CONFIG: RadioMediumConfig = {
  pathLossExponent: 2.7, // Suburban environment
  referenceDistance: 1, // 1 meter
  referenceLoss: 40, // dB at 1 meter (typical for 915 MHz)
  rxSensitivity: -130, // dBm (typical LoRa)
  enableCollisions: false, // Simplified model
  enableFading: true,
  fadingSigma: 4, // dB standard deviation
};

// Speed of light in km/ms
const SPEED_OF_LIGHT = 299792.458;

export class RadioMedium {
  readonly config: RadioMediumConfig;
  private random?: SeededRandom;

  constructor(config: Partial<RadioMediumConfig> = {}, random?: SeededRandom) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.random = random;
  }

  /**
   * Calculate path loss using log-distance model
   */
  private calculatePathLoss(distanceKm: number): number {
    const distanceM = distanceKm * 1000;
    const { pathLossExponent, referenceDistance, referenceLoss } = this.config;

    if (distanceM < referenceDistance) {
      return referenceLoss;
    }

    // Log-distance path loss model
    // PL(d) = PL(d0) + 10 * n * log10(d / d0)
    const pathLoss =
      referenceLoss +
      10 * pathLossExponent * Math.log10(distanceM / referenceDistance);

    return pathLoss;
  }

  /**
   * Add random fading component (log-normal shadowing)
   */
  private addFading(rssi: number): number {
    if (!this.config.enableFading || !this.random) {
      return rssi;
    }

    const fading = this.random.nextGaussian(0, this.config.fadingSigma);
    return rssi + fading;
  }

  /**
   * Check if receiver can hear transmitter
   */
  canHear(from: VirtualNode, to: VirtualNode): boolean {
    const linkBudget = this.getLinkBudget(from, to);
    return linkBudget.canReceive;
  }

  /**
   * Calculate RSSI at receiver
   */
  calculateRssi(from: VirtualNode, to: VirtualNode): number {
    const distance = haversineDistance(from.position, to.position);
    const pathLoss = this.calculatePathLoss(distance);
    const rssi = from.config.txPower - pathLoss;

    return this.addFading(rssi);
  }

  /**
   * Get all neighbors that can hear this node
   */
  getNeighbors(node: VirtualNode, allNodes: VirtualNode[]): VirtualNode[] {
    return allNodes.filter(
      (other) => other.id !== node.id && this.canHear(node, other)
    );
  }

  /**
   * Calculate complete link budget
   */
  getLinkBudget(from: VirtualNode, to: VirtualNode): LinkBudget {
    const distance = haversineDistance(from.position, to.position);
    const pathLoss = this.calculatePathLoss(distance);
    const rssi = from.config.txPower - pathLoss;

    // Simple SNR estimate (assuming noise floor at -140 dBm)
    const noiseFloor = -140;
    const snr = rssi - noiseFloor;

    const canReceive = rssi >= this.config.rxSensitivity;

    return {
      distance,
      pathLoss,
      rssi,
      snr,
      canReceive,
    };
  }

  /**
   * Transmit a packet and determine which nodes receive it
   */
  transmit(
    sender: VirtualNode,
    packet: Packet,
    allNodes: VirtualNode[]
  ): TransmissionResult {
    const reachedNodes: TransmissionResult['reachedNodes'] = [];
    const collisions: string[] = [];

    for (const node of allNodes) {
      // Skip sender
      if (node.id === sender.id) {
        continue;
      }

      // Check if node can receive
      const linkBudget = this.getLinkBudget(sender, node);

      if (linkBudget.canReceive) {
        // Calculate propagation delay
        // For simulation purposes, treat delays < 1ms as immediate
        const actualDelay = (linkBudget.distance / SPEED_OF_LIGHT) * 1000;
        const delay = actualDelay < 1 ? 0 : actualDelay;

        // Add fading to RSSI
        const rssi = this.addFading(linkBudget.rssi);

        reachedNodes.push({
          node,
          rssi,
          delay,
        });
      }
    }

    // TODO: Implement collision detection if enabled
    // For now, collisions are not modeled

    return {
      reachedNodes,
      collisions,
    };
  }
}
