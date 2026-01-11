/**
 * Packet transmission animation layer
 * Uses CSS animations for smooth GPU-accelerated rendering
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
  animationDuration: 1500, // Slower animation
  transmissionColor: '#667eea',
  deliveredColor: '#4ade80',
  droppedColor: '#ef4444',
};

// Inject CSS animation styles once
let stylesInjected = false;
function injectAnimationStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes packet-ripple {
      0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 1;
      }
      70% {
        opacity: 0.7;
      }
      100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0;
      }
    }
    .packet-ripple {
      position: absolute;
      width: 200px;
      height: 200px;
      border-radius: 50%;
      pointer-events: none;
      will-change: transform, opacity;
    }
  `;
  document.head.appendChild(style);
}

export class PacketAnimation {
  private simulation: Simulation;
  private simMap: SimulationMap;
  private config: PacketAnimationConfig;
  private activeMarkers: Set<L.Marker> = new Set();
  private drawnPaths: Set<string> = new Set(); // Track packets that already have paths drawn

  constructor(
    simulation: Simulation,
    simMap: SimulationMap,
    config: Partial<PacketAnimationConfig> = {}
  ) {
    this.simulation = simulation;
    this.simMap = simMap;
    this.config = { ...DEFAULT_CONFIG, ...config };

    injectAnimationStyles();
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
   * Animate packet transmission using CSS animations (GPU-accelerated)
   */
  private animateTransmission(sender: VirtualNode, _packet: Packet): void {
    // Calculate pixel size based on zoom level for consistent visual size
    const map = this.simMap.getMap();
    const zoom = map.getZoom();
    const baseSize = 300; // Base size in pixels at zoom 13
    const size = baseSize * Math.pow(2, zoom - 13);

    // Create a div icon with CSS animation
    const rippleHtml = `
      <div class="packet-ripple" style="
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, ${this.config.transmissionColor}80 0%, ${this.config.transmissionColor}30 50%, ${this.config.transmissionColor}00 70%);
        border: 3px solid ${this.config.transmissionColor};
        box-shadow: 0 0 10px ${this.config.transmissionColor}80;
        animation: packet-ripple ${this.config.animationDuration}ms ease-out forwards;
      "></div>
    `;

    const icon = L.divIcon({
      html: rippleHtml,
      className: '', // Remove default leaflet styling
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const marker = L.marker([sender.position.lat, sender.position.lng], { icon });
    marker.addTo(this.simMap.getLayer('packets'));
    this.activeMarkers.add(marker);

    // Remove marker after animation completes
    setTimeout(() => {
      marker.remove();
      this.activeMarkers.delete(marker);
    }, this.config.animationDuration + 50);
  }

  /**
   * Show delivery path for a packet (only once per packet ID)
   */
  private showDeliveryPath(packet: Packet, color: string): void {
    // Only draw path once per packet to avoid overlapping flashing paths
    if (this.drawnPaths.has(packet.header.id)) return;
    this.drawnPaths.add(packet.header.id);

    // Clean up old entries to prevent memory leak
    if (this.drawnPaths.size > 100) {
      const entries = Array.from(this.drawnPaths);
      entries.slice(0, 50).forEach(id => this.drawnPaths.delete(id));
    }

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
    // Remove all active markers
    for (const marker of this.activeMarkers) {
      marker.remove();
    }
    this.activeMarkers.clear();
    this.drawnPaths.clear();

    // Clear packet layer
    this.simMap.clearLayer('packets');
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
