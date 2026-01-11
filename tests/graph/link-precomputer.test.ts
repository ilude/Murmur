import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinkPrecomputer, type ComputeProgress } from '@/graph/link-precomputer';
import { LinkGraph } from '@/graph/link-graph';
import { RadioMedium } from '@/core/radio-medium';
import { VirtualNode } from '@/core/node';

describe('LinkPrecomputer', () => {
  let graph: LinkGraph;
  let radioMedium: RadioMedium;
  let precomputer: LinkPrecomputer;

  const createNode = (id: string, lat: number, lng: number): VirtualNode => {
    return new VirtualNode({
      id,
      position: { lat, lng },
      radioRange: 10,
      txPower: 20,
      dutyCycle: 0.1,
    });
  };

  beforeEach(() => {
    graph = new LinkGraph();
    radioMedium = new RadioMedium();
    precomputer = new LinkPrecomputer(radioMedium, graph, {
      maxDistanceKm: 50, // Large enough to include test nodes
    });
  });

  describe('computeLinksForNode', () => {
    it('should compute links to all nodes in range', async () => {
      const nodeA = createNode('A', 40.0, -80.0);
      const nodeB = createNode('B', 40.01, -80.0); // ~1.1km away
      const nodeC = createNode('C', 40.02, -80.0); // ~2.2km away

      // Add nodes to graph first
      graph.addNode('A', nodeA.position);
      graph.addNode('B', nodeB.position);
      graph.addNode('C', nodeC.position);

      const count = await precomputer.computeLinksForNode(nodeA, [nodeA, nodeB, nodeC]);

      expect(count).toBe(2);
      expect(graph.hasLink('A', 'B')).toBe(true);
      expect(graph.hasLink('A', 'C')).toBe(true);
    });

    it('should not compute links to nodes outside max distance', async () => {
      const precomputerSmallRange = new LinkPrecomputer(radioMedium, graph, {
        maxDistanceKm: 1, // 1km max
      });

      const nodeA = createNode('A', 40.0, -80.0);
      const nodeB = createNode('B', 40.02, -80.0); // ~2.2km away - outside range

      graph.addNode('A', nodeA.position);
      graph.addNode('B', nodeB.position);

      const count = await precomputerSmallRange.computeLinksForNode(nodeA, [nodeA, nodeB]);

      expect(count).toBe(0);
      expect(graph.hasLink('A', 'B')).toBe(false);
    });

    it('should store correct link budget data', async () => {
      const nodeA = createNode('A', 40.0, -80.0);
      const nodeB = createNode('B', 40.01, -80.0);

      graph.addNode('A', nodeA.position);
      graph.addNode('B', nodeB.position);

      await precomputer.computeLinksForNode(nodeA, [nodeA, nodeB]);

      const link = graph.getLink('A', 'B');
      expect(link).toBeDefined();
      expect(link!.distance).toBeGreaterThan(0);
      expect(link!.pathLoss).toBeGreaterThan(0);
      expect(link!.rssi).toBeLessThan(0);
      expect(typeof link!.canReceive).toBe('boolean');
      expect(link!.computedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('computeAllLinks', () => {
    it('should compute all links between nodes', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
        createNode('C', 40.02, -80.0),
      ];

      const count = await precomputer.computeAllLinks(nodes);

      // With 3 nodes, we should have 3 possible links (A-B, A-C, B-C)
      // But since we're computing unidirectional, and there's dedup logic,
      // the actual count depends on the order of processing
      expect(count).toBeGreaterThan(0);
      expect(graph.getNodeCount()).toBe(3);
    });

    it('should call progress callback', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
        createNode('C', 40.02, -80.0),
      ];

      const progressUpdates: ComputeProgress[] = [];
      await precomputer.computeAllLinks(nodes, (progress) => {
        progressUpdates.push({ ...progress });
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.every((p) => p.totalPairs > 0)).toBe(true);
    });

    it('should add nodes to graph if not present', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
      ];

      await precomputer.computeAllLinks(nodes);

      expect(graph.hasNode('A')).toBe(true);
      expect(graph.hasNode('B')).toBe(true);

      const nodeA = graph.getNode('A');
      expect(nodeA?.position.lat).toBe(40.0);
    });
  });

  describe('recomputeNodeLinks', () => {
    it('should remove old links and compute new ones', async () => {
      const nodeA = createNode('A', 40.0, -80.0);
      const nodeB = createNode('B', 40.01, -80.0);
      const nodeC = createNode('C', 40.02, -80.0);

      // Initial computation
      await precomputer.computeAllLinks([nodeA, nodeB, nodeC]);
      expect(graph.hasLink('A', 'B')).toBe(true);

      // Move node A
      nodeA.position.lat = 40.05;
      await precomputer.recomputeNodeLinks(nodeA, [nodeA, nodeB, nodeC]);

      // Node A should still have links
      const neighbors = graph.getNeighbors('A');
      expect(neighbors.length).toBeGreaterThan(0);
    });
  });

  describe('addNode', () => {
    it('should add node and compute its links', async () => {
      const nodeA = createNode('A', 40.0, -80.0);
      const nodeB = createNode('B', 40.01, -80.0);

      // Add first node
      graph.addNode('A', nodeA.position);

      // Add second node via precomputer
      const count = await precomputer.addNode(nodeB, [nodeA, nodeB]);

      expect(graph.hasNode('B')).toBe(true);
      expect(count).toBe(1); // Link to A
    });
  });

  describe('removeNode', () => {
    it('should remove node and its links', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
        createNode('C', 40.02, -80.0),
      ];

      await precomputer.computeAllLinks(nodes);
      expect(graph.hasNode('B')).toBe(true);

      const removed = precomputer.removeNode('B');

      expect(removed).toBeGreaterThan(0);
      expect(graph.hasNode('B')).toBe(false);
      expect(graph.hasLink('A', 'B')).toBe(false);
      expect(graph.hasLink('B', 'C')).toBe(false);
    });
  });

  describe('stale link detection', () => {
    it('should identify stale links', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
      ];

      // Create precomputer with very short stale threshold
      const shortStalePrecomputer = new LinkPrecomputer(radioMedium, graph, {
        maxDistanceKm: 50,
        staleThresholdMs: 1, // 1ms stale threshold
      });

      await shortStalePrecomputer.computeAllLinks(nodes);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const stale = shortStalePrecomputer.getStaleLinks();
      expect(stale.length).toBeGreaterThan(0);
    });

    it('should invalidate stale links', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
      ];

      const shortStalePrecomputer = new LinkPrecomputer(radioMedium, graph, {
        maxDistanceKm: 50,
        staleThresholdMs: 1,
      });

      await shortStalePrecomputer.computeAllLinks(nodes);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const invalidated = shortStalePrecomputer.invalidateStaleLinks();
      expect(invalidated).toBeGreaterThan(0);
      expect(graph.getLinkCount()).toBe(0);
    });

    it('should refresh stale links', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
      ];

      const shortStalePrecomputer = new LinkPrecomputer(radioMedium, graph, {
        maxDistanceKm: 50,
        staleThresholdMs: 1,
      });

      await shortStalePrecomputer.computeAllLinks(nodes);
      const initialLink = graph.getLink('A', 'B');
      const initialTime = initialLink?.computedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const refreshed = await shortStalePrecomputer.refreshStaleLinks(nodes);
      expect(refreshed).toBeGreaterThan(0);

      const refreshedLink = graph.getLink('A', 'B');
      expect(refreshedLink?.computedAt).toBeGreaterThan(initialTime!);
    });
  });

  describe('cached lookups', () => {
    it('should return cached link budget', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
      ];

      await precomputer.computeAllLinks(nodes);

      const cached = precomputer.getCachedLinkBudget('A', 'B');
      expect(cached).toBeDefined();
      expect(cached!.distance).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent link', () => {
      const cached = precomputer.getCachedLinkBudget('X', 'Y');
      expect(cached).toBeUndefined();
    });

    it('should check for cached link', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
      ];

      await precomputer.computeAllLinks(nodes);

      expect(precomputer.hasCachedLink('A', 'B')).toBe(true);
      expect(precomputer.hasCachedLink('X', 'Y')).toBe(false);
    });

    it('should get reachable neighbors', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
        createNode('C', 40.02, -80.0),
      ];

      await precomputer.computeAllLinks(nodes);

      const neighbors = precomputer.getReachableNeighbors('A');
      expect(neighbors.length).toBeGreaterThan(0);
    });
  });

  describe('pathfinding', () => {
    it('should find optimal path using cached data', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
        createNode('C', 40.02, -80.0),
        createNode('D', 40.03, -80.0),
      ];

      await precomputer.computeAllLinks(nodes);

      const path = precomputer.findOptimalPath('A', 'D');
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toBe('A');
      expect(path[path.length - 1]).toBe('D');
    });
  });

  describe('statistics', () => {
    it('should return correct stats', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
        createNode('C', 40.02, -80.0),
      ];

      await precomputer.computeAllLinks(nodes);

      const stats = precomputer.getStats();
      expect(stats.nodeCount).toBe(3);
      expect(stats.linkCount).toBeGreaterThan(0);
      expect(stats.staleCount).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all cached data', async () => {
      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
      ];

      await precomputer.computeAllLinks(nodes);
      expect(graph.getNodeCount()).toBe(2);
      expect(graph.getLinkCount()).toBeGreaterThan(0);

      precomputer.clear();

      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getLinkCount()).toBe(0);
    });
  });

  describe('terrain-aware computation', () => {
    it('should use async link budget when terrain enabled', async () => {
      const terrainPrecomputer = new LinkPrecomputer(radioMedium, graph, {
        maxDistanceKm: 50,
        useTerrainLOS: true,
      });

      // Spy on the async method
      const spy = vi.spyOn(radioMedium, 'getLinkBudgetAsync');

      const nodes = [
        createNode('A', 40.0, -80.0),
        createNode('B', 40.01, -80.0),
      ];

      await terrainPrecomputer.computeAllLinks(nodes);

      // Should have used the async method
      expect(spy).toHaveBeenCalled();
    });
  });
});
