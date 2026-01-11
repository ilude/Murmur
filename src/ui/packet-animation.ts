/**
 * Packet transmission animation layer
 */

import L from 'leaflet';
import type { Packet } from '../core/packet.js';
import type { VirtualNode } from '../core/node.js';
import type { Simulation } from '../core/simulation.js';
import type { SimulationMap } from './map.js';

export interface PacketAnimationConfig {
  showTransmissions: boolean;
  showPaths: boolean;
  animationDuration: number; // ms
  transmissionColor: string;
  deliveredColor: string;
  droppedColor: string;
}

const DEFAULT_CONFIG: PacketAnimationConfig = {
  showTransmissions: true,
  showPaths: true,
  animationDuration: 500,
  transmissionColor: '#667eea',
  deliveredColor: '#4ade80',
  droppedColor: '#ef4444',
};

interface AnimationState {
  circle: L.Circle;
  startTime: number;
  duration: number;
}

export class PacketAnimation {
  private simulation: Simulation;
  private simMap: SimulationMap;
  private config: PacketAnimationConfig;
  private animations: Map<string, AnimationState> = new Map();
  private animationFrame?: number;

  constructor(
    simulation: Simulation,
    simMap: SimulationMap,
    config: Partial<PacketAnimationConfig> = {}
  ) {
    this.simulation = simulation;
    this.simMap = simMap;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.setupEventListeners();
  }

  /**
   * Set up simulation event listeners
   */
  private setupEventListeners(): void {
    this.simulation.on('packet:transmitted', ({ packet, sender }) => {
      if (this.config.showTransmissions) {
        this.animateTransmission(sender, packet);
      }
    });

    this.simulation.on('packet:delivered', ({ packet }) => {
      if (this.config.showPaths) {
        this.showDeliveryPath(packet, this.config.deliveredColor);
      }
    });

    this.simulation.on('packet:dropped', ({ packet }) => {
      if (this.config.showPaths) {
        this.showDeliveryPath(packet, this.config.droppedColor);
      }
    });
  }

  /**
   * Animate packet transmission as expanding circle
   */
  private animateTransmission(sender: VirtualNode, packet: Packet): void {
    const circle = L.circle([sender.position.lat, sender.position.lng], {
      radius: 100,
      fillColor: this.config.transmissionColor,
      color: this.config.transmissionColor,
      weight: 2,
      opacity: 1,
      fillOpacity: 0.3,
    });

    circle.addTo(this.simMap.getLayer('packets'));

    const animationId = `${packet.header.id}-${Date.now()}`;
    this.animations.set(animationId, {
      circle,
      startTime: Date.now(),
      duration: this.config.animationDuration,
    });

    // Start animation loop if not running
    if (!this.animationFrame) {
      this.startAnimationLoop();
    }
  }

  /**
   * Start the animation loop
   */
  private startAnimationLoop(): void {
    const animate = () => {
      const now = Date.now();
      const toRemove: string[] = [];

      for (const [id, state] of this.animations) {
        const elapsed = now - state.startTime;
        const progress = Math.min(elapsed / state.duration, 1);

        // Update circle
        const maxRadius = 5000; // 5km in meters
        const radius = progress * maxRadius;
        const opacity = 1 - progress;

        state.circle.setRadius(radius);
        state.circle.setStyle({
          opacity: opacity,
          fillOpacity: opacity * 0.3,
        });

        // Remove if animation complete
        if (progress >= 1) {
          state.circle.remove();
          toRemove.push(id);
        }
      }

      // Clean up completed animations
      for (const id of toRemove) {
        this.animations.delete(id);
      }

      // Continue loop if animations remain
      if (this.animations.size > 0) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        this.animationFrame = undefined;
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Show delivery path for a packet
   */
  private showDeliveryPath(packet: Packet, color: string): void {
    const path = packet.meta.path;
    if (path.length < 2) return;

    const coordinates: L.LatLng[] = [];

    for (const nodeId of path) {
      const node = this.simulation.getNode(nodeId);
      if (node) {
        coordinates.push(L.latLng(node.position.lat, node.position.lng));
      }
    }

    if (coordinates.length < 2) return;

    const polyline = L.polyline(coordinates, {
      color: color,
      weight: 3,
      opacity: 0.8,
      dashArray: '10, 5',
    });

    polyline.addTo(this.simMap.getLayer('packets'));

    // Fade out after a delay
    setTimeout(() => {
      const fadeOut = () => {
        const currentOpacity = polyline.options.opacity ?? 0;
        if (currentOpacity > 0) {
          polyline.setStyle({ opacity: currentOpacity - 0.05 });
          requestAnimationFrame(fadeOut);
        } else {
          polyline.remove();
        }
      };
      fadeOut();
    }, 2000);
  }

  /**
   * Clear all animations
   */
  clear(): void {
    // Remove all animation circles
    for (const state of this.animations.values()) {
      state.circle.remove();
    }
    this.animations.clear();

    // Clear packet layer
    this.simMap.clearLayer('packets');

    // Stop animation loop
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }

  /**
   * Toggle transmission animations
   */
  toggleTransmissions(show: boolean): void {
    this.config.showTransmissions = show;
    if (!show) {
      this.clear();
    }
  }

  /**
   * Toggle path visualization
   */
  togglePaths(show: boolean): void {
    this.config.showPaths = show;
  }
}
