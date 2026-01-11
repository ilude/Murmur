/**
 * Leaflet map integration for Murmur simulator
 */

import L from 'leaflet';
import type { Simulation } from '../core/simulation.js';

export interface MapConfig {
  containerId: string;
  center: [number, number];
  zoom: number;
  showGrid?: boolean;
}

const DEFAULT_CONFIG: MapConfig = {
  containerId: 'map',
  center: [47.6062, -122.3321], // Seattle
  zoom: 10,
  showGrid: false,
};

export class SimulationMap {
  private map: L.Map;
  private simulation: Simulation;
  private config: MapConfig;
  private layers: {
    nodes: L.LayerGroup;
    connections: L.LayerGroup;
    packets: L.LayerGroup;
  };

  constructor(simulation: Simulation, config: Partial<MapConfig> = {}) {
    this.simulation = simulation;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize map
    this.map = L.map(this.config.containerId).setView(
      this.config.center,
      this.config.zoom
    );

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    // Create layer groups
    this.layers = {
      nodes: L.layerGroup().addTo(this.map),
      connections: L.layerGroup().addTo(this.map),
      packets: L.layerGroup().addTo(this.map),
    };
  }

  /**
   * Get the Leaflet map instance
   */
  getMap(): L.Map {
    return this.map;
  }

  /**
   * Get layer group by name
   */
  getLayer(name: keyof typeof this.layers): L.LayerGroup {
    return this.layers[name];
  }

  /**
   * Convert map click to lat/lng
   */
  onMapClick(callback: (lat: number, lng: number) => void): void {
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      callback(e.latlng.lat, e.latlng.lng);
    });
  }

  /**
   * Clear a specific layer
   */
  clearLayer(name: keyof typeof this.layers): void {
    this.layers[name].clearLayers();
  }

  /**
   * Clear all layers
   */
  clearAllLayers(): void {
    Object.values(this.layers).forEach(layer => layer.clearLayers());
  }

  /**
   * Fit map to show all nodes
   */
  fitToNodes(): void {
    const nodes = Array.from(this.simulation.nodes.values());
    if (nodes.length === 0) return;

    const bounds = L.latLngBounds(
      nodes.map(node => [node.position.lat, node.position.lng] as [number, number])
    );

    this.map.fitBounds(bounds, { padding: [50, 50] });
  }

  /**
   * Destroy map and clean up
   */
  destroy(): void {
    this.map.remove();
  }
}
