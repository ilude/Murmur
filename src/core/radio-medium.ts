/**
 * Radio medium simulation for RF propagation between nodes
 */

import type { VirtualNode } from './node.js';
import type { Packet } from './packet.js';
import type { SeededRandom } from '../utils/random.js';
import { haversineDistance } from '../utils/geo.js';
import { LOSCalculator, type LOSConfig } from '../terrain/index.js';
import type { LinkGraph, LinkEdgeData } from '../graph/index.js';

export interface TerrainConfig {
  samplePoints: number; // Number of terrain samples (default: 15)
  fresnelClearance: number; // Required Fresnel zone clearance (default: 0.6)
  frequencyMHz: number; // Radio frequency (default: 915)
  antennaHeightM: number; // Antenna height above ground (default: 2)
  obstructionLossDb: number; // Additional path loss when obstructed (default: 20)
}

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

  // Terrain awareness
  enableTerrain: boolean; // Enable terrain-aware LOS checks
  terrainConfig: TerrainConfig;
}

export interface LinkBudget {
  distance: number; // km
  pathLoss: number; // dB
  rssi: number; // dBm at receiver
  snr: number; // Signal to noise ratio estimate
  canReceive: boolean;
  // Terrain (populated by async methods when terrain enabled)
  hasLineOfSight?: boolean;
  terrainLoss?: number; // Additional loss from terrain obstruction
}

export interface TransmissionResult {
  reachedNodes: Array<{
    node: VirtualNode;
    rssi: number;
    delay: number; // propagation delay in ms
  }>;
  collisions: string[]; // Node IDs that experienced collision
}

const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  samplePoints: 15,
  fresnelClearance: 0.6,
  frequencyMHz: 915,
  antennaHeightM: 2,
  obstructionLossDb: 20,
};

const DEFAULT_CONFIG: RadioMediumConfig = {
  pathLossExponent: 2.7, // Suburban environment
  referenceDistance: 1, // 1 meter
  referenceLoss: 40, // dB at 1 meter (typical for 915 MHz)
  rxSensitivity: -130, // dBm (typical LoRa)
  enableCollisions: false, // Simplified model
  enableFading: true,
  fadingSigma: 4, // dB standard deviation
  enableTerrain: false, // Disabled by default
  terrainConfig: DEFAULT_TERRAIN_CONFIG,
};

// Speed of light in km/ms
const SPEED_OF_LIGHT = 299792.458;

export class RadioMedium {
  readonly config: RadioMediumConfig;
  private random: SeededRandom | undefined;
  private losCalculator: LOSCalculator | undefined;

  constructor(config: Partial<RadioMediumConfig> = {}, random?: SeededRandom) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      terrainConfig: { ...DEFAULT_TERRAIN_CONFIG, ...config.terrainConfig },
    };
    this.random = random;

    // Initialize LOS calculator if terrain is enabled
    if (this.config.enableTerrain) {
      const losConfig: Partial<LOSConfig> = {
        samplePoints: this.config.terrainConfig.samplePoints,
        fresnelClearance: this.config.terrainConfig.fresnelClearance,
        frequencyMHz: this.config.terrainConfig.frequencyMHz,
        antennaHeightM: this.config.terrainConfig.antennaHeightM,
      };
      this.losCalculator = new LOSCalculator(losConfig);
    }
  }

  /**
   * Get the LOS calculator (if terrain is enabled)
   */
  getLOSCalculator(): LOSCalculator | undefined {
    return this.losCalculator;
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
   * Calculate link budget with terrain awareness (async)
   * Includes LOS check and terrain obstruction loss
   */
  async getLinkBudgetAsync(from: VirtualNode, to: VirtualNode): Promise<LinkBudget> {
    const baseBudget = this.getLinkBudget(from, to);

    // If terrain not enabled or no calculator, return base budget
    if (!this.config.enableTerrain || !this.losCalculator) {
      return baseBudget;
    }

    // Check LOS
    const losResult = await this.losCalculator.checkLOS(from.position, to.position);

    // Calculate terrain loss
    const terrainLoss = losResult.hasLOS ? 0 : this.config.terrainConfig.obstructionLossDb;

    // Adjust budget for terrain
    const adjustedPathLoss = baseBudget.pathLoss + terrainLoss;
    const adjustedRssi = from.config.txPower - adjustedPathLoss;
    const adjustedCanReceive = adjustedRssi >= this.config.rxSensitivity;

    return {
      ...baseBudget,
      pathLoss: adjustedPathLoss,
      rssi: adjustedRssi,
      canReceive: adjustedCanReceive,
      hasLineOfSight: losResult.hasLOS,
      terrainLoss,
    };
  }

  /**
   * Check if receiver can hear transmitter with terrain awareness (async)
   */
  async canHearAsync(from: VirtualNode, to: VirtualNode): Promise<boolean> {
    const linkBudget = await this.getLinkBudgetAsync(from, to);
    return linkBudget.canReceive;
  }

  /**
   * Get link budget with graph cache lookup
   * Checks the graph cache first, falls back to computation if not found
   */
  getLinkBudgetCached(
    from: VirtualNode,
    to: VirtualNode,
    graph: LinkGraph
  ): LinkBudget {
    // Try to get from cache
    const cached = graph.getLink(from.id, to.id);
    if (cached) {
      return this.edgeDataToLinkBudget(cached);
    }

    // Fall back to computation
    return this.getLinkBudget(from, to);
  }

  /**
   * Convert cached edge data to LinkBudget
   */
  private edgeDataToLinkBudget(edge: LinkEdgeData): LinkBudget {
    const noiseFloor = -140;
    const budget: LinkBudget = {
      distance: edge.distance,
      pathLoss: edge.pathLoss,
      rssi: edge.rssi,
      snr: edge.rssi - noiseFloor,
      canReceive: edge.canReceive,
    };
    if (edge.hasLineOfSight !== undefined) {
      budget.hasLineOfSight = edge.hasLineOfSight;
    }
    if (edge.terrainLoss !== undefined) {
      budget.terrainLoss = edge.terrainLoss;
    }
    return budget;
  }

  /**
   * Pre-compute terrain data for all node pairs
   * Call this before simulation to warm the cache
   */
  async precomputeTerrain(nodes: VirtualNode[]): Promise<void> {
    if (!this.losCalculator) {
      return;
    }

    // Collect all sample points for all node pairs
    const { interpolatePoints } = await import('../utils/geo.js');
    const allPoints: Array<{ lat: number; lng: number }> = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const from = nodes[i]!;
        const to = nodes[j]!;
        const samplePoints = interpolatePoints(
          from.position,
          to.position,
          this.config.terrainConfig.samplePoints
        );
        allPoints.push(...samplePoints);
      }
    }

    // Prefetch all elevations
    await this.losCalculator.prefetchElevations(allPoints);
  }

  /**
   * Transmit a packet and determine which nodes receive it
   */
  transmit(
    sender: VirtualNode,
    _packet: Packet,
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
