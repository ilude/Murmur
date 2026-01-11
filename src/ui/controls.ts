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
          <h3>Simulation</h3>
          <div class="button-group">
            <button id="btn-play" class="btn btn-primary">
              <span class="icon">▶</span> Play
            </button>
            <button id="btn-pause" class="btn" disabled>
              <span class="icon">⏸</span> Pause
            </button>
            <button id="btn-step" class="btn">
              <span class="icon">⏭</span> Step
            </button>
            <button id="btn-reset" class="btn btn-danger">
              <span class="icon">↻</span> Reset
            </button>
          </div>
        </div>

        <div class="control-section">
          <h3>Speed</h3>
          <div class="speed-control">
            <input type="range" id="speed-slider" min="0" max="3" step="1" value="1">
            <span id="speed-label">1x</span>
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
            <div class="stat-item">
              <span class="stat-label">Sim Time</span>
              <span class="stat-value" id="stat-time">0s</span>
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
    // Playback controls
    this.getButton('btn-play')?.addEventListener('click', () => this.play());
    this.getButton('btn-pause')?.addEventListener('click', () => this.pause());
    this.getButton('btn-step')?.addEventListener('click', () => this.step());
    this.getButton('btn-reset')?.addEventListener('click', () => this.reset());

    // Speed control
    const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
    speedSlider?.addEventListener('input', (e) => {
      const speeds = [0.1, 1, 10, 100];
      const index = parseInt((e.target as HTMLInputElement).value);
      const speed = speeds[index] ?? 1;
      this.setSpeed(speed);
      this.updateSpeedLabel(speed);
    });

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
    this.setStatValue('stat-time', `${(this.simulation.currentTime / 1000).toFixed(1)}s`);

    // Update node markers
    this.nodeLayer.updateMarkers();
  }

  /**
   * Play simulation
   */
  private play(): void {
    this.simulation.start();
    this.getButton('btn-play')?.setAttribute('disabled', 'true');
    this.getButton('btn-pause')?.removeAttribute('disabled');
  }

  /**
   * Pause simulation
   */
  private pause(): void {
    this.simulation.stop();
    this.getButton('btn-pause')?.setAttribute('disabled', 'true');
    this.getButton('btn-play')?.removeAttribute('disabled');
  }

  /**
   * Step simulation
   */
  private step(): void {
    this.simulation.step();
    this.nodeLayer.updateConnections();
  }

  /**
   * Reset simulation
   */
  private reset(): void {
    if (confirm('Reset simulation? This will clear all nodes and packets.')) {
      this.simulation.stop();
      this.simulation.reset();

      // Remove all nodes
      const nodeIds = Array.from(this.simulation.nodes.keys());
      for (const id of nodeIds) {
        this.simulation.removeNode(id);
      }

      this.nodeCounter = 0;
      this.getButton('btn-pause')?.setAttribute('disabled', 'true');
      this.getButton('btn-play')?.removeAttribute('disabled');
    }
  }

  /**
   * Set simulation speed
   */
  private setSpeed(multiplier: number): void {
    // Update simulation config
    this.simulation.config.realtimeMultiplier = multiplier;

    // Restart if running
    if (this.simulation.isRunning) {
      this.simulation.stop();
      this.simulation.start();
    }
  }

  /**
   * Update speed label
   */
  private updateSpeedLabel(speed: number): void {
    const label = document.getElementById('speed-label');
    if (label) {
      label.textContent = `${speed}x`;
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
