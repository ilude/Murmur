/**
 * Node visualization layer for the simulation map
 */

import L from 'leaflet';
import type { VirtualNode } from '../core/node.js';
import type { Simulation } from '../core/simulation.js';
import type { SimulationMap } from './map.js';

export interface NodeLayerConfig {
  showLabels: boolean;
  showConnections: boolean;
  showRadioRange: boolean;
  nodeColor: string;
  connectionColor: string;
  rangeColor: string;
}

const DEFAULT_CONFIG: NodeLayerConfig = {
  showLabels: true,
  showConnections: true,
  showRadioRange: false,
  nodeColor: '#667eea',
  connectionColor: '#4ade80',
  rangeColor: '#667eea',
};

export class NodeLayer {
  private simulation: Simulation;
  private simMap: SimulationMap;
  private config: NodeLayerConfig;
  private nodeMarkers: Map<string, L.CircleMarker> = new Map();
  private rangeCircles: Map<string, L.Circle> = new Map();
  private connections: L.Polyline[] = [];

  constructor(
    simulation: Simulation,
    simMap: SimulationMap,
    config: Partial<NodeLayerConfig> = {}
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
    this.simulation.on('node:added', ({ node }) => {
      this.addNodeMarker(node);
    });

    this.simulation.on('node:removed', ({ nodeId }) => {
      this.removeNodeMarker(nodeId);
    });
  }

  /**
   * Add a node marker to the map
   */
  private addNodeMarker(node: VirtualNode): void {
    const marker = L.circleMarker([node.position.lat, node.position.lng], {
      radius: 8,
      fillColor: this.config.nodeColor,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
    });

    // Add tooltip with node info
    if (this.config.showLabels) {
      marker.bindTooltip(
        `<strong>${node.id}</strong><br>` +
        `Address: ${node.getFormattedAddress()}<br>` +
        `Sent: ${node.stats.packetsSent} | Recv: ${node.stats.packetsReceived}`,
        { permanent: false, direction: 'top' }
      );
    }

    // Make marker draggable
    marker.on('drag', (e: L.LeafletEvent) => {
      const dragEvent = e as L.DragEndEvent;
      const newPos = (dragEvent.target as L.CircleMarker).getLatLng();
      node.updatePosition({ lat: newPos.lat, lng: newPos.lng });
      this.updateConnections();
      this.updateRadioRange(node);
    });

    marker.addTo(this.simMap.getLayer('nodes'));
    this.nodeMarkers.set(node.id, marker);

    // Add radio range circle if enabled
    if (this.config.showRadioRange) {
      this.addRadioRange(node);
    }
  }

  /**
   * Remove a node marker from the map
   */
  private removeNodeMarker(nodeId: string): void {
    const marker = this.nodeMarkers.get(nodeId);
    if (marker) {
      marker.remove();
      this.nodeMarkers.delete(nodeId);
    }

    const rangeCircle = this.rangeCircles.get(nodeId);
    if (rangeCircle) {
      rangeCircle.remove();
      this.rangeCircles.delete(nodeId);
    }
  }

  /**
   * Add radio range circle for a node
   */
  private addRadioRange(node: VirtualNode): void {
    const circle = L.circle([node.position.lat, node.position.lng], {
      radius: node.config.radioRange * 1000, // Convert km to meters
      fillColor: this.config.rangeColor,
      color: this.config.rangeColor,
      weight: 1,
      opacity: 0.3,
      fillOpacity: 0.1,
    });

    circle.addTo(this.simMap.getLayer('nodes'));
    this.rangeCircles.set(node.id, circle);
  }

  /**
   * Update radio range circle for a node
   */
  private updateRadioRange(node: VirtualNode): void {
    const circle = this.rangeCircles.get(node.id);
    if (circle) {
      circle.setLatLng([node.position.lat, node.position.lng]);
    }
  }

  /**
   * Update connection lines between nodes
   */
  updateConnections(): void {
    // Clear existing connections
    this.connections.forEach(line => line.remove());
    this.connections = [];

    if (!this.config.showConnections) return;

    const topology = this.simulation.getTopology();

    // Draw connections
    for (const link of topology.links) {
      const fromNode = this.simulation.getNode(link.from);
      const toNode = this.simulation.getNode(link.to);

      if (!fromNode || !toNode) continue;

      // Only draw each connection once (not bidirectional)
      if (link.from > link.to) continue;

      const line = L.polyline(
        [
          [fromNode.position.lat, fromNode.position.lng],
          [toNode.position.lat, toNode.position.lng],
        ],
        {
          color: this.config.connectionColor,
          weight: 2,
          opacity: 0.5,
          dashArray: '5, 5',
        }
      );

      line.addTo(this.simMap.getLayer('connections'));
      this.connections.push(line);
    }
  }

  /**
   * Update node markers with latest stats
   */
  updateMarkers(): void {
    for (const [nodeId, marker] of this.nodeMarkers) {
      const node = this.simulation.getNode(nodeId);
      if (!node) continue;

      // Update tooltip
      if (this.config.showLabels) {
        marker.setTooltipContent(
          `<strong>${node.id}</strong><br>` +
          `Address: ${node.getFormattedAddress()}<br>` +
          `Sent: ${node.stats.packetsSent} | Recv: ${node.stats.packetsReceived}`
        );
      }
    }
  }

  /**
   * Highlight a node
   */
  highlightNode(nodeId: string): void {
    const marker = this.nodeMarkers.get(nodeId);
    if (marker) {
      marker.setStyle({
        fillColor: '#ff6b6b',
        radius: 12,
      });
    }
  }

  /**
   * Reset node highlight
   */
  resetNodeHighlight(nodeId: string): void {
    const marker = this.nodeMarkers.get(nodeId);
    if (marker) {
      marker.setStyle({
        fillColor: this.config.nodeColor,
        radius: 8,
      });
    }
  }

  /**
   * Toggle radio range visibility
   */
  toggleRadioRange(show: boolean): void {
    this.config.showRadioRange = show;

    if (show) {
      // Add range circles for all nodes
      for (const node of this.simulation.nodes.values()) {
        if (!this.rangeCircles.has(node.id)) {
          this.addRadioRange(node);
        }
      }
    } else {
      // Remove all range circles
      for (const circle of this.rangeCircles.values()) {
        circle.remove();
      }
      this.rangeCircles.clear();
    }
  }

  /**
   * Toggle connection visibility
   */
  toggleConnections(show: boolean): void {
    this.config.showConnections = show;
    this.updateConnections();
  }

  /**
   * Get node marker at position
   */
  getNodeAt(lat: number, lng: number, tolerance: number = 0.001): VirtualNode | null {
    for (const node of this.simulation.nodes.values()) {
      const latDiff = Math.abs(node.position.lat - lat);
      const lngDiff = Math.abs(node.position.lng - lng);

      if (latDiff < tolerance && lngDiff < tolerance) {
        return node;
      }
    }

    return null;
  }

  /**
   * Center map on a specific node
   */
  centerOnNode(nodeId: string): void {
    const node = this.simulation.getNode(nodeId);
    if (node) {
      this.simMap.getMap().setView([node.position.lat, node.position.lng], 14);
      this.highlightNode(nodeId);

      // Reset highlight after delay
      setTimeout(() => {
        this.resetNodeHighlight(nodeId);
      }, 2000);
    }
  }
}
