/**
 * Link precomputer - computes and caches link budgets between nodes
 */

import type { VirtualNode } from '../core/node.js';
import type { RadioMedium, LinkBudget } from '../core/radio-medium.js';
import { haversineDistance } from '../utils/geo.js';
import { LinkGraph, type LinkEdgeData } from './link-graph.js';

export interface LinkPrecomputerConfig {
  maxDistanceKm: number;        // Maximum distance to consider (default: 20km)
  batchSize: number;            // Nodes to process per batch (default: 10)
  staleThresholdMs: number;     // Age at which links become stale (default: 5 minutes)
  useTerrainLOS: boolean;       // Use async terrain-aware LOS (default: false)
}

export interface ComputeProgress {
  totalPairs: number;
  completedPairs: number;
  currentNode: string | null;
}

export type ProgressCallback = (progress: ComputeProgress) => void;

const DEFAULT_CONFIG: LinkPrecomputerConfig = {
  maxDistanceKm: 20,
  batchSize: 10,
  staleThresholdMs: 5 * 60 * 1000, // 5 minutes
  useTerrainLOS: false,
};

export class LinkPrecomputer {
  private config: LinkPrecomputerConfig;
  private radioMedium: RadioMedium;
  private graph: LinkGraph;

  constructor(
    radioMedium: RadioMedium,
    graph: LinkGraph,
    config: Partial<LinkPrecomputerConfig> = {}
  ) {
    this.radioMedium = radioMedium;
    this.graph = graph;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the underlying link graph
   */
  getGraph(): LinkGraph {
    return this.graph;
  }

  /**
   * Convert a LinkBudget to LinkEdgeData for storage
   */
  private budgetToEdgeData(budget: LinkBudget): LinkEdgeData {
    const edgeData: LinkEdgeData = {
      distance: budget.distance,
      pathLoss: budget.pathLoss,
      rssi: budget.rssi,
      canReceive: budget.canReceive,
      computedAt: Date.now(),
    };
    if (budget.hasLineOfSight !== undefined) {
      edgeData.hasLineOfSight = budget.hasLineOfSight;
    }
    if (budget.terrainLoss !== undefined) {
      edgeData.terrainLoss = budget.terrainLoss;
    }
    return edgeData;
  }

  /**
   * Get nodes within max distance of a given node
   */
  private getNodesInRange(node: VirtualNode, allNodes: VirtualNode[]): VirtualNode[] {
    return allNodes.filter((other) => {
      if (other.id === node.id) return false;
      const distance = haversineDistance(node.position, other.position);
      return distance <= this.config.maxDistanceKm;
    });
  }

  /**
   * Compute links for a single node to all other nodes in range
   */
  async computeLinksForNode(
    node: VirtualNode,
    allNodes: VirtualNode[]
  ): Promise<number> {
    const nodesInRange = this.getNodesInRange(node, allNodes);
    let count = 0;

    for (const other of nodesInRange) {
      let budget: LinkBudget;

      if (this.config.useTerrainLOS) {
        budget = await this.radioMedium.getLinkBudgetAsync(node, other);
      } else {
        budget = this.radioMedium.getLinkBudget(node, other);
      }

      const edgeData = this.budgetToEdgeData(budget);
      this.graph.setLink(node.id, other.id, edgeData);
      count++;
    }

    return count;
  }

  /**
   * Compute all links between all nodes
   * Returns the number of links computed
   */
  async computeAllLinks(
    nodes: VirtualNode[],
    onProgress?: ProgressCallback
  ): Promise<number> {
    // Ensure all nodes are in the graph
    this.graph.beginUpdate();
    for (const node of nodes) {
      if (!this.graph.hasNode(node.id)) {
        this.graph.addNode(node.id, node.position, {
          txPower: node.config.txPower,
          radioRange: node.config.radioRange,
        });
      }
    }
    this.graph.endUpdate();

    // Calculate total pairs for progress
    const totalPairs = (nodes.length * (nodes.length - 1)) / 2;
    let completedPairs = 0;
    let totalLinks = 0;

    // Process in batches
    for (let i = 0; i < nodes.length; i += this.config.batchSize) {
      const batch = nodes.slice(i, i + this.config.batchSize);

      this.graph.beginUpdate();
      for (const node of batch) {
        const nodesInRange = this.getNodesInRange(node, nodes);

        for (const other of nodesInRange) {
          // Skip if we've already computed this pair
          // We only need to compute each pair once (links are bidirectional in most cases)
          if (this.graph.hasLink(node.id, other.id)) {
            continue;
          }

          let budget: LinkBudget;
          if (this.config.useTerrainLOS) {
            budget = await this.radioMedium.getLinkBudgetAsync(node, other);
          } else {
            budget = this.radioMedium.getLinkBudget(node, other);
          }

          const edgeData = this.budgetToEdgeData(budget);
          this.graph.setLink(node.id, other.id, edgeData);
          totalLinks++;
          completedPairs++;

          if (onProgress) {
            onProgress({
              totalPairs,
              completedPairs,
              currentNode: node.id,
            });
          }
        }
      }
      this.graph.endUpdate();
    }

    return totalLinks;
  }

  /**
   * Recompute all links for a specific node (e.g., when it moves)
   */
  async recomputeNodeLinks(
    node: VirtualNode,
    allNodes: VirtualNode[]
  ): Promise<number> {
    // Remove old links
    this.graph.removeLinksForNode(node.id);

    // Update node position in graph
    this.graph.updateNode(node.id, {
      position: node.position,
      txPower: node.config.txPower,
      radioRange: node.config.radioRange,
    });

    // Recompute links
    return await this.computeLinksForNode(node, allNodes);
  }

  /**
   * Add a new node and compute its links
   */
  async addNode(node: VirtualNode, allNodes: VirtualNode[]): Promise<number> {
    this.graph.addNode(node.id, node.position, {
      txPower: node.config.txPower,
      radioRange: node.config.radioRange,
    });

    return await this.computeLinksForNode(node, allNodes);
  }

  /**
   * Remove a node and all its links
   */
  removeNode(nodeId: string): number {
    const linksRemoved = this.graph.removeLinksForNode(nodeId);
    this.graph.removeNode(nodeId);
    return linksRemoved;
  }

  /**
   * Get stale links that need recomputation
   */
  getStaleLinks(): Array<{ from: string; to: string; data: LinkEdgeData }> {
    return this.graph.getStaleLinks(this.config.staleThresholdMs);
  }

  /**
   * Invalidate and remove stale links
   */
  invalidateStaleLinks(): number {
    const stale = this.getStaleLinks();
    for (const link of stale) {
      this.graph.removeLink(link.from, link.to);
    }
    return stale.length;
  }

  /**
   * Refresh stale links by recomputing them
   */
  async refreshStaleLinks(allNodes: VirtualNode[]): Promise<number> {
    const stale = this.getStaleLinks();
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
    let refreshed = 0;

    for (const link of stale) {
      const fromNode = nodeMap.get(link.from);
      const toNode = nodeMap.get(link.to);

      if (!fromNode || !toNode) {
        // Node no longer exists, remove the link
        this.graph.removeLink(link.from, link.to);
        continue;
      }

      let budget: LinkBudget;
      if (this.config.useTerrainLOS) {
        budget = await this.radioMedium.getLinkBudgetAsync(fromNode, toNode);
      } else {
        budget = this.radioMedium.getLinkBudget(fromNode, toNode);
      }

      const edgeData = this.budgetToEdgeData(budget);
      this.graph.setLink(fromNode.id, toNode.id, edgeData);
      refreshed++;
    }

    return refreshed;
  }

  /**
   * Get cached link budget between two nodes
   * Returns undefined if not cached
   */
  getCachedLinkBudget(from: string, to: string): LinkEdgeData | undefined {
    return this.graph.getLink(from, to);
  }

  /**
   * Check if a cached link exists
   */
  hasCachedLink(from: string, to: string): boolean {
    return this.graph.hasLink(from, to);
  }

  /**
   * Get all reachable neighbors from cache
   */
  getReachableNeighbors(nodeId: string): Array<{ id: string; link: LinkEdgeData }> {
    return this.graph.getReachableNeighbors(nodeId);
  }

  /**
   * Find optimal path between two nodes using cached data
   */
  findOptimalPath(from: string, to: string): string[] {
    return this.graph.findPath(from, to);
  }

  /**
   * Get statistics about the precomputed links
   */
  getStats(): {
    nodeCount: number;
    linkCount: number;
    staleCount: number;
  } {
    return {
      nodeCount: this.graph.getNodeCount(),
      linkCount: this.graph.getLinkCount(),
      staleCount: this.getStaleLinks().length,
    };
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.graph.clear();
  }
}
