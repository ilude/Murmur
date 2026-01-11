/**
 * In-memory graph for storing precomputed radio link data
 * Wraps ngraph.graph with domain-specific operations
 */

import createGraph, { type Graph } from 'ngraph.graph';
import { nba, type PathFinder } from 'ngraph.path';
import type { LatLng } from '../utils/geo.js';

export interface NodeData {
  position: LatLng;
  txPower?: number;
  radioRange?: number;
}

export interface LinkEdgeData {
  distance: number;      // km
  pathLoss: number;      // dB
  rssi: number;          // dBm
  canReceive: boolean;
  hasLineOfSight?: boolean;
  terrainLoss?: number;
  computedAt: number;    // timestamp for cache invalidation
}

export interface NeighborInfo {
  id: string;
  link: LinkEdgeData;
}

export interface SerializedGraph {
  nodes: Array<{ id: string; data: NodeData }>;
  links: Array<{ from: string; to: string; data: LinkEdgeData }>;
}

export class LinkGraph {
  private graph: Graph<NodeData, LinkEdgeData>;
  private pathFinder: PathFinder<NodeData> | undefined;
  private pathFinderDirty: boolean = true;

  constructor() {
    this.graph = createGraph<NodeData, LinkEdgeData>();
  }

  /**
   * Add a node to the graph
   */
  addNode(id: string, position: LatLng, data?: Partial<NodeData>): void {
    this.graph.addNode(id, { position, ...data });
    this.pathFinderDirty = true;
  }

  /**
   * Remove a node from the graph (also removes all connected links)
   */
  removeNode(id: string): boolean {
    const removed = this.graph.removeNode(id);
    if (removed) {
      this.pathFinderDirty = true;
    }
    return removed;
  }

  /**
   * Check if a node exists
   */
  hasNode(id: string): boolean {
    return this.graph.hasNode(id) !== undefined;
  }

  /**
   * Get node data
   */
  getNode(id: string): NodeData | undefined {
    const node = this.graph.getNode(id);
    return node?.data;
  }

  /**
   * Update node data
   */
  updateNode(id: string, data: Partial<NodeData>): void {
    const node = this.graph.getNode(id);
    if (node) {
      node.data = { ...node.data, ...data };
    }
  }

  /**
   * Set a link between two nodes with edge data
   */
  setLink(from: string, to: string, data: LinkEdgeData): void {
    // Remove existing link if present (to update data)
    const existing = this.graph.getLink(from, to);
    if (existing) {
      this.graph.removeLink(existing);
    }
    this.graph.addLink(from, to, data);
    this.pathFinderDirty = true;
  }

  /**
   * Get link data between two nodes
   */
  getLink(from: string, to: string): LinkEdgeData | undefined {
    const link = this.graph.getLink(from, to);
    return link?.data;
  }

  /**
   * Check if a link exists
   */
  hasLink(from: string, to: string): boolean {
    return this.graph.hasLink(from, to) !== undefined;
  }

  /**
   * Remove a link between two nodes
   */
  removeLink(from: string, to: string): boolean {
    const link = this.graph.getLink(from, to);
    if (!link) return false;
    const removed = this.graph.removeLink(link);
    if (removed) {
      this.pathFinderDirty = true;
    }
    return removed;
  }

  /**
   * Remove all links involving a node
   */
  removeLinksForNode(nodeId: string): number {
    const links = this.graph.getLinks(nodeId);
    if (!links) return 0;

    let count = 0;
    const linksToRemove = Array.from(links);
    for (const link of linksToRemove) {
      if (this.graph.removeLink(link)) {
        count++;
      }
    }

    if (count > 0) {
      this.pathFinderDirty = true;
    }
    return count;
  }

  /**
   * Get all neighbors of a node with link data
   */
  getNeighbors(nodeId: string): NeighborInfo[] {
    const neighbors: NeighborInfo[] = [];

    this.graph.forEachLinkedNode(nodeId, (_otherNode, link) => {
      // Determine the neighbor ID (the other end of the link)
      const neighborId = link.fromId === nodeId
        ? String(link.toId)
        : String(link.fromId);

      neighbors.push({
        id: neighborId,
        link: link.data,
      });
    });

    return neighbors;
  }

  /**
   * Get all reachable neighbors (where canReceive is true)
   */
  getReachableNeighbors(nodeId: string): NeighborInfo[] {
    return this.getNeighbors(nodeId).filter(n => n.link.canReceive);
  }

  /**
   * Find optimal path between two nodes using NBA* algorithm
   * Optimizes for minimum path loss (strongest signal path)
   */
  findPath(from: string, to: string): string[] {
    if (!this.hasNode(from) || !this.hasNode(to)) {
      return [];
    }

    // Rebuild path finder if graph changed
    if (this.pathFinderDirty || !this.pathFinder) {
      this.pathFinder = nba<NodeData, LinkEdgeData>(this.graph, {
        oriented: false,
        distance: (_fromNode, _toNode, link) => {
          // Use path loss as distance (minimize total path loss)
          return link.data.pathLoss;
        },
        blocked: (_fromNode, _toNode, link) => {
          // Block links where receiver can't hear
          return !link.data.canReceive;
        },
      });
      this.pathFinderDirty = false;
    }

    const path = this.pathFinder.find(from, to);
    // ngraph.path returns path from destination to source, so reverse it
    return path.map(node => String(node.id)).reverse();
  }

  /**
   * Get all nodes within a certain hop distance
   */
  getNodesWithinHops(nodeId: string, maxHops: number): string[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; hops: number }> = [{ id: nodeId, hops: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id)) continue;
      visited.add(current.id);

      if (current.hops < maxHops) {
        for (const neighbor of this.getReachableNeighbors(current.id)) {
          if (!visited.has(neighbor.id)) {
            queue.push({ id: neighbor.id, hops: current.hops + 1 });
          }
        }
      }
    }

    // Remove the starting node from results
    visited.delete(nodeId);
    return Array.from(visited);
  }

  /**
   * Begin batch update (suspends change events)
   */
  beginUpdate(): void {
    this.graph.beginUpdate();
  }

  /**
   * End batch update (resumes change events)
   */
  endUpdate(): void {
    this.graph.endUpdate();
    this.pathFinderDirty = true;
  }

  /**
   * Get node count
   */
  getNodeCount(): number {
    return this.graph.getNodeCount();
  }

  /**
   * Get link count
   */
  getLinkCount(): number {
    return this.graph.getLinkCount();
  }

  /**
   * Iterate over all nodes
   */
  forEachNode(callback: (id: string, data: NodeData) => void): void {
    this.graph.forEachNode(node => {
      callback(String(node.id), node.data);
    });
  }

  /**
   * Iterate over all links
   */
  forEachLink(callback: (from: string, to: string, data: LinkEdgeData) => void): void {
    this.graph.forEachLink(link => {
      callback(String(link.fromId), String(link.toId), link.data);
    });
  }

  /**
   * Get all links that are stale (older than threshold)
   */
  getStaleLinks(olderThanMs: number): Array<{ from: string; to: string; data: LinkEdgeData }> {
    const threshold = Date.now() - olderThanMs;
    const stale: Array<{ from: string; to: string; data: LinkEdgeData }> = [];

    this.graph.forEachLink(link => {
      if (link.data.computedAt < threshold) {
        stale.push({
          from: String(link.fromId),
          to: String(link.toId),
          data: link.data,
        });
      }
    });

    return stale;
  }

  /**
   * Serialize graph to JSON
   */
  toJSON(): SerializedGraph {
    const nodes: SerializedGraph['nodes'] = [];
    const links: SerializedGraph['links'] = [];

    this.graph.forEachNode(node => {
      nodes.push({ id: String(node.id), data: node.data });
    });

    this.graph.forEachLink(link => {
      links.push({
        from: String(link.fromId),
        to: String(link.toId),
        data: link.data,
      });
    });

    return { nodes, links };
  }

  /**
   * Load graph from JSON
   */
  fromJSON(data: SerializedGraph): void {
    this.clear();

    this.graph.beginUpdate();
    try {
      for (const node of data.nodes) {
        this.graph.addNode(node.id, node.data);
      }
      for (const link of data.links) {
        this.graph.addLink(link.from, link.to, link.data);
      }
    } finally {
      this.graph.endUpdate();
    }

    this.pathFinderDirty = true;
  }

  /**
   * Clear all nodes and links
   */
  clear(): void {
    this.graph.clear();
    this.pathFinder = undefined;
    this.pathFinderDirty = true;
  }
}
