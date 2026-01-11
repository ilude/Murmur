/**
 * Node list panel with accordion-style expandable items
 */

import type { Simulation } from '../core/simulation.js';
import type { VirtualNode } from '../core/node.js';
import type { NodeLayer } from './node-layer.js';

export interface NodeListPanelConfig {
  containerId: string;
  updateInterval: number;
}

const DEFAULT_CONFIG: NodeListPanelConfig = {
  containerId: 'node-list',
  updateInterval: 500,
};

export class NodeListPanel {
  private simulation: Simulation;
  private nodeLayer: NodeLayer;
  private config: NodeListPanelConfig;
  private container: HTMLElement;
  private updateTimer: number | undefined;
  private expandedNodes: Set<string> = new Set();
  private selectedNodeId: string | undefined;

  constructor(
    simulation: Simulation,
    nodeLayer: NodeLayer,
    config: Partial<NodeListPanelConfig> = {}
  ) {
    this.simulation = simulation;
    this.nodeLayer = nodeLayer;
    this.config = { ...DEFAULT_CONFIG, ...config };

    const container = document.getElementById(this.config.containerId);
    if (!container) {
      throw new Error(`Container #${this.config.containerId} not found`);
    }
    this.container = container;

    this.render();
    this.startUpdateLoop();
  }

  /**
   * Render the node list panel
   */
  private render(): void {
    const nodes = Array.from(this.simulation.nodes.values());

    if (nodes.length === 0) {
      this.container.innerHTML = `
        <div class="node-list-empty">
          No nodes in simulation.<br>
          Click on the map to add nodes.
        </div>
      `;
      return;
    }

    const nodeItems = nodes
      .map((node) => this.renderNodeItem(node))
      .join('');

    this.container.innerHTML = `
      <div class="node-list-header">
        <span class="node-list-count">${nodes.length} node${nodes.length !== 1 ? 's' : ''}</span>
        <button class="btn-expand-all" title="Expand all">⊞</button>
        <button class="btn-collapse-all" title="Collapse all">⊟</button>
      </div>
      <div class="node-list-items">
        ${nodeItems}
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render a single node item
   */
  private renderNodeItem(node: VirtualNode): string {
    const isExpanded = this.expandedNodes.has(node.id);
    const isSelected = this.selectedNodeId === node.id;
    const address = node.getFormattedAddress();

    return `
      <div class="node-item ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}" data-node-id="${node.id}">
        <div class="node-item-header">
          <span class="node-expand-icon">${isExpanded ? '▼' : '▶'}</span>
          <span class="node-item-name">${node.id}</span>
          <span class="node-item-status ${node.stats.packetsReceived > 0 ? 'active' : ''}"></span>
        </div>
        ${isExpanded ? this.renderNodeDetails(node, address) : ''}
      </div>
    `;
  }

  /**
   * Render expanded node details
   */
  private renderNodeDetails(node: VirtualNode, address: string): string {
    const pos = node.position;

    return `
      <div class="node-item-details">
        <div class="node-detail-row">
          <span class="node-detail-label">Address</span>
          <span class="node-detail-value mono">${address}</span>
        </div>
        <div class="node-detail-row">
          <span class="node-detail-label">Position</span>
          <span class="node-detail-value mono">${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}</span>
        </div>
        <div class="node-detail-row">
          <span class="node-detail-label">TX Power</span>
          <span class="node-detail-value">${node.config.txPower} dBm</span>
        </div>
        <div class="node-detail-row">
          <span class="node-detail-label">Range</span>
          <span class="node-detail-value">${node.config.radioRange} km</span>
        </div>
        <div class="node-stats-grid">
          <div class="node-stat">
            <span class="node-stat-value">${node.stats.packetsReceived}</span>
            <span class="node-stat-label">Recv</span>
          </div>
          <div class="node-stat">
            <span class="node-stat-value">${node.stats.packetsSent}</span>
            <span class="node-stat-label">Sent</span>
          </div>
          <div class="node-stat">
            <span class="node-stat-value">${node.stats.packetsForwarded}</span>
            <span class="node-stat-label">Fwd</span>
          </div>
          <div class="node-stat">
            <span class="node-stat-value">${node.stats.packetsDropped}</span>
            <span class="node-stat-label">Drop</span>
          </div>
        </div>
        <div class="node-actions">
          <button class="btn btn-sm btn-locate" data-action="locate" title="Center on map">📍</button>
          <button class="btn btn-sm btn-send" data-action="send" title="Send test packet">📡</button>
          <button class="btn btn-sm btn-delete" data-action="delete" title="Remove node">🗑</button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to rendered elements
   */
  private attachEventListeners(): void {
    // Expand/collapse individual nodes
    this.container.querySelectorAll('.node-item-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        const nodeItem = (e.currentTarget as HTMLElement).closest('.node-item');
        const nodeId = nodeItem?.getAttribute('data-node-id');
        if (nodeId) {
          this.toggleNode(nodeId);
        }
      });
    });

    // Expand all button
    this.container.querySelector('.btn-expand-all')?.addEventListener('click', () => {
      this.expandAll();
    });

    // Collapse all button
    this.container.querySelector('.btn-collapse-all')?.addEventListener('click', () => {
      this.collapseAll();
    });

    // Action buttons
    this.container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
        const nodeItem = (e.currentTarget as HTMLElement).closest('.node-item');
        const nodeId = nodeItem?.getAttribute('data-node-id');

        if (nodeId && action) {
          this.handleAction(nodeId, action);
        }
      });
    });
  }

  /**
   * Toggle node expansion
   */
  private toggleNode(nodeId: string): void {
    if (this.expandedNodes.has(nodeId)) {
      this.expandedNodes.delete(nodeId);
    } else {
      this.expandedNodes.add(nodeId);
    }
    this.render();
  }

  /**
   * Expand all nodes
   */
  private expandAll(): void {
    for (const node of this.simulation.nodes.values()) {
      this.expandedNodes.add(node.id);
    }
    this.render();
  }

  /**
   * Collapse all nodes
   */
  private collapseAll(): void {
    this.expandedNodes.clear();
    this.render();
  }

  /**
   * Handle node action
   */
  private handleAction(nodeId: string, action: string): void {
    const node = this.simulation.getNode(nodeId);
    if (!node) return;

    switch (action) {
      case 'locate':
        this.nodeLayer.centerOnNode(nodeId);
        this.selectNode(nodeId);
        break;

      case 'send':
        this.simulation.injectPacket(
          nodeId,
          'broadcast',
          new TextEncoder().encode(`Test from ${nodeId}`)
        );
        break;

      case 'delete':
        if (confirm(`Remove node ${nodeId}?`)) {
          this.simulation.removeNode(nodeId);
          this.expandedNodes.delete(nodeId);
          if (this.selectedNodeId === nodeId) {
            this.selectedNodeId = undefined;
          }
          this.nodeLayer.updateConnections();
          this.render();
        }
        break;
    }
  }

  /**
   * Select a node
   */
  selectNode(nodeId: string): void {
    this.selectedNodeId = nodeId;
    if (!this.expandedNodes.has(nodeId)) {
      this.expandedNodes.add(nodeId);
    }
    this.render();

    // Scroll node into view
    const nodeElement = this.container.querySelector(`[data-node-id="${nodeId}"]`);
    nodeElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Start update loop
   */
  private startUpdateLoop(): void {
    const update = () => {
      this.render();
      this.updateTimer = window.setTimeout(update, this.config.updateInterval);
    };
    update();
  }

  /**
   * Stop update loop
   */
  destroy(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }
}
