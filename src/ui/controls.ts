/**
 * Simulation control panel
 */

import type { Simulation } from '../core/simulation.js';
import type { NodeLayer } from './node-layer.js';
import { createFloodingStrategy } from '../core/routing/flooding.js';

export interface ControlsConfig {
  containerId: string;
  updateInterval: number; // ms between UI updates
}

const DEFAULT_CONFIG: ControlsConfig = {
  containerId: 'controls',
  updateInterval: 100,
};

export class Controls {
  private simulation: Simulation;
  private nodeLayer: NodeLayer;
  private config: ControlsConfig;
  private container: HTMLElement;
  private updateTimer?: number;
  private nodeCounter: number = 0;

  constructor(
    simulation: Simulation,
    nodeLayer: NodeLayer,
    config: Partial<ControlsConfig> = {}
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
    this.setupEventListeners();
    this.startUpdateLoop();
  }

  /**
   * Render the control panel
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="controls-panel">
        <div class="control-section">
          <h3>Network</h3>
          <div class="button-group">
            <button id="btn-reset" class="btn btn-danger">
              <span class="icon">↻</span> Clear Network
            </button>
          </div>
        </div>

        <div class="control-section">
          <h3>View</h3>
          <div class="checkbox-group">
            <label>
              <input type="checkbox" id="show-connections" checked>
              Show Connections
            </label>
            <label>
              <input type="checkbox" id="show-range">
              Show Radio Range
            </label>
            <label>
              <input type="checkbox" id="show-animations" checked>
              Show Animations
            </label>
          </div>
        </div>

        <div class="control-section">
          <h3>Actions</h3>
          <div class="button-group">
            <button id="btn-add-node" class="btn">
              <span class="icon">+</span> Add Random Node
            </button>
            <button id="btn-broadcast" class="btn">
              <span class="icon">📡</span> Broadcast Test
            </button>
          </div>
        </div>

        <div class="control-section">
          <h3>Statistics</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Nodes</span>
              <span class="stat-value" id="stat-nodes">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Packets</span>
              <span class="stat-value" id="stat-packets">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Delivered</span>
              <span class="stat-value" id="stat-delivered">0</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Delivery Rate</span>
              <span class="stat-value" id="stat-rate">0%</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Avg Hops</span>
              <span class="stat-value" id="stat-hops">0</span>
            </div>
          </div>
        </div>

        <div class="control-section">
          <h3>Info</h3>
          <div id="info-panel" class="info-panel">
            Click on the map to add nodes. Click a node to select it.
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Network control
    this.getButton('btn-reset')?.addEventListener('click', () => this.reset());

    // View toggles
    document.getElementById('show-connections')?.addEventListener('change', (e) => {
      this.nodeLayer.toggleConnections((e.target as HTMLInputElement).checked);
    });

    document.getElementById('show-range')?.addEventListener('change', (e) => {
      this.nodeLayer.toggleRadioRange((e.target as HTMLInputElement).checked);
    });

    // Actions
    this.getButton('btn-add-node')?.addEventListener('click', () => this.addRandomNode());
    this.getButton('btn-broadcast')?.addEventListener('click', () => this.broadcastTest());
  }

  /**
   * Start update loop
   */
  private startUpdateLoop(): void {
    const update = () => {
      this.updateStats();
      this.updateTimer = window.setTimeout(update, this.config.updateInterval);
    };
    update();
  }

  /**
   * Update statistics display
   */
  private updateStats(): void {
    const stats = this.simulation.getStats();

    this.setStatValue('stat-nodes', this.simulation.nodes.size.toString());
    this.setStatValue('stat-packets', stats.totalPackets.toString());
    this.setStatValue('stat-delivered', stats.deliveredPackets.toString());
    this.setStatValue('stat-rate', `${(stats.deliveryRate * 100).toFixed(0)}%`);
    this.setStatValue('stat-hops', stats.averageHops.toFixed(1));

    // Update node markers
    this.nodeLayer.updateMarkers();
  }

  /**
   * Reset/clear the network
   */
  private reset(): void {
    if (confirm('Clear network? This will remove all nodes and packets.')) {
      this.simulation.reset();

      // Remove all nodes
      const nodeIds = Array.from(this.simulation.nodes.keys());
      for (const id of nodeIds) {
        this.simulation.removeNode(id);
      }

      this.nodeCounter = 0;
      this.nodeLayer.updateConnections();
    }
  }

  /**
   * Add random node
   */
  private addRandomNode(): void {
    // Get random position near map center
    const lat = 47.6062 + (Math.random() - 0.5) * 0.2;
    const lng = -122.3321 + (Math.random() - 0.5) * 0.2;

    const node = this.simulation.addNode({
      id: `node-${this.nodeCounter++}`,
      position: { lat, lng },
      radioRange: 10,
      txPower: 20,
      dutyCycle: 0.1,
    });

    node.setRoutingStrategy(createFloodingStrategy());
    this.nodeLayer.updateConnections();
  }

  /**
   * Broadcast test message
   */
  private broadcastTest(): void {
    const nodes = Array.from(this.simulation.nodes.values());
    if (nodes.length === 0) {
      alert('Add some nodes first!');
      return;
    }

    const sender = nodes[0]!;
    const message = `Test broadcast at ${new Date().toLocaleTimeString()}`;

    this.simulation.injectPacket(
      sender.id,
      'broadcast',
      new TextEncoder().encode(message)
    );

    this.showInfo(`Broadcasting from ${sender.id}`);
  }

  /**
   * Show info message
   */
  showInfo(message: string): void {
    const panel = document.getElementById('info-panel');
    if (panel) {
      panel.textContent = message;
    }
  }

  /**
   * Helper to get button element
   */
  private getButton(id: string): HTMLButtonElement | null {
    return document.getElementById(id) as HTMLButtonElement;
  }

  /**
   * Helper to set stat value
   */
  private setStatValue(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  /**
   * Destroy controls and clean up
   */
  destroy(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }
}
