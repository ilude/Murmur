import { describe, it, expect, beforeEach } from 'vitest';
import { LinkGraph, type LinkEdgeData } from '@/graph/link-graph';

describe('LinkGraph', () => {
  let graph: LinkGraph;

  const createLinkData = (overrides: Partial<LinkEdgeData> = {}): LinkEdgeData => ({
    distance: 1.0,
    pathLoss: 80,
    rssi: -60,
    canReceive: true,
    computedAt: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    graph = new LinkGraph();
  });

  describe('node operations', () => {
    it('should add and retrieve nodes', () => {
      graph.addNode('node-1', { lat: 40.0, lng: -80.0 });

      expect(graph.hasNode('node-1')).toBe(true);
      expect(graph.getNode('node-1')).toEqual({
        position: { lat: 40.0, lng: -80.0 },
      });
    });

    it('should add node with additional data', () => {
      graph.addNode('node-1', { lat: 40.0, lng: -80.0 }, {
        txPower: 20,
        radioRange: 5,
      });

      const data = graph.getNode('node-1');
      expect(data?.txPower).toBe(20);
      expect(data?.radioRange).toBe(5);
    });

    it('should remove nodes', () => {
      graph.addNode('node-1', { lat: 40.0, lng: -80.0 });

      expect(graph.removeNode('node-1')).toBe(true);
      expect(graph.hasNode('node-1')).toBe(false);
    });

    it('should return false when removing non-existent node', () => {
      expect(graph.removeNode('non-existent')).toBe(false);
    });

    it('should update node data', () => {
      graph.addNode('node-1', { lat: 40.0, lng: -80.0 });
      graph.updateNode('node-1', { txPower: 30 });

      const data = graph.getNode('node-1');
      expect(data?.txPower).toBe(30);
      expect(data?.position).toEqual({ lat: 40.0, lng: -80.0 });
    });

    it('should count nodes', () => {
      expect(graph.getNodeCount()).toBe(0);

      graph.addNode('node-1', { lat: 40.0, lng: -80.0 });
      graph.addNode('node-2', { lat: 40.1, lng: -80.1 });

      expect(graph.getNodeCount()).toBe(2);
    });
  });

  describe('link operations', () => {
    beforeEach(() => {
      graph.addNode('node-a', { lat: 40.0, lng: -80.0 });
      graph.addNode('node-b', { lat: 40.1, lng: -80.1 });
      graph.addNode('node-c', { lat: 40.2, lng: -80.2 });
    });

    it('should set and retrieve links', () => {
      const linkData = createLinkData({ distance: 5.0, rssi: -70 });
      graph.setLink('node-a', 'node-b', linkData);

      expect(graph.hasLink('node-a', 'node-b')).toBe(true);
      expect(graph.getLink('node-a', 'node-b')).toEqual(linkData);
    });

    it('should update existing links', () => {
      graph.setLink('node-a', 'node-b', createLinkData({ rssi: -60 }));
      graph.setLink('node-a', 'node-b', createLinkData({ rssi: -80 }));

      const link = graph.getLink('node-a', 'node-b');
      expect(link?.rssi).toBe(-80);
      expect(graph.getLinkCount()).toBe(1);
    });

    it('should remove links', () => {
      graph.setLink('node-a', 'node-b', createLinkData());

      expect(graph.removeLink('node-a', 'node-b')).toBe(true);
      expect(graph.hasLink('node-a', 'node-b')).toBe(false);
    });

    it('should remove all links for a node', () => {
      graph.setLink('node-a', 'node-b', createLinkData());
      graph.setLink('node-a', 'node-c', createLinkData());
      graph.setLink('node-b', 'node-c', createLinkData());

      const removed = graph.removeLinksForNode('node-a');

      expect(removed).toBe(2);
      expect(graph.hasLink('node-a', 'node-b')).toBe(false);
      expect(graph.hasLink('node-a', 'node-c')).toBe(false);
      expect(graph.hasLink('node-b', 'node-c')).toBe(true);
    });

    it('should count links', () => {
      expect(graph.getLinkCount()).toBe(0);

      graph.setLink('node-a', 'node-b', createLinkData());
      graph.setLink('node-a', 'node-c', createLinkData());

      expect(graph.getLinkCount()).toBe(2);
    });
  });

  describe('neighbor queries', () => {
    beforeEach(() => {
      graph.addNode('center', { lat: 40.0, lng: -80.0 });
      graph.addNode('north', { lat: 40.1, lng: -80.0 });
      graph.addNode('south', { lat: 39.9, lng: -80.0 });
      graph.addNode('isolated', { lat: 41.0, lng: -80.0 });

      graph.setLink('center', 'north', createLinkData({ canReceive: true }));
      graph.setLink('center', 'south', createLinkData({ canReceive: false }));
    });

    it('should get all neighbors', () => {
      const neighbors = graph.getNeighbors('center');

      expect(neighbors).toHaveLength(2);
      expect(neighbors.map(n => n.id).sort()).toEqual(['north', 'south']);
    });

    it('should get only reachable neighbors', () => {
      const reachable = graph.getReachableNeighbors('center');

      expect(reachable).toHaveLength(1);
      expect(reachable[0]!.id).toBe('north');
    });

    it('should return empty array for isolated node', () => {
      expect(graph.getNeighbors('isolated')).toEqual([]);
    });
  });

  describe('pathfinding', () => {
    beforeEach(() => {
      // Create a chain: A -- B -- C -- D
      graph.addNode('A', { lat: 40.0, lng: -80.0 });
      graph.addNode('B', { lat: 40.1, lng: -80.0 });
      graph.addNode('C', { lat: 40.2, lng: -80.0 });
      graph.addNode('D', { lat: 40.3, lng: -80.0 });

      graph.setLink('A', 'B', createLinkData({ pathLoss: 70 }));
      graph.setLink('B', 'C', createLinkData({ pathLoss: 80 }));
      graph.setLink('C', 'D', createLinkData({ pathLoss: 75 }));
    });

    it('should find path between connected nodes', () => {
      const path = graph.findPath('A', 'D');

      expect(path).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should return empty array for non-existent nodes', () => {
      expect(graph.findPath('A', 'Z')).toEqual([]);
      expect(graph.findPath('Z', 'A')).toEqual([]);
    });

    it('should return empty array when no path exists', () => {
      graph.addNode('isolated', { lat: 50.0, lng: -80.0 });

      expect(graph.findPath('A', 'isolated')).toEqual([]);
    });

    it('should find optimal path based on path loss', () => {
      // Add a direct link with higher path loss
      graph.setLink('A', 'D', createLinkData({ pathLoss: 300 }));

      // Should still prefer A-B-C-D (total: 225) over A-D (300)
      const path = graph.findPath('A', 'D');
      expect(path).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should avoid blocked links', () => {
      // Make B-C unreachable
      graph.setLink('B', 'C', createLinkData({ pathLoss: 80, canReceive: false }));

      // Add alternate path A-D direct
      graph.setLink('A', 'D', createLinkData({ pathLoss: 200, canReceive: true }));

      const path = graph.findPath('A', 'D');
      expect(path).toEqual(['A', 'D']);
    });
  });

  describe('hop distance queries', () => {
    beforeEach(() => {
      // Create a graph:
      //   A -- B -- C
      //        |
      //        D -- E
      graph.addNode('A', { lat: 40.0, lng: -80.0 });
      graph.addNode('B', { lat: 40.1, lng: -80.0 });
      graph.addNode('C', { lat: 40.2, lng: -80.0 });
      graph.addNode('D', { lat: 40.1, lng: -80.1 });
      graph.addNode('E', { lat: 40.1, lng: -80.2 });

      graph.setLink('A', 'B', createLinkData());
      graph.setLink('B', 'C', createLinkData());
      graph.setLink('B', 'D', createLinkData());
      graph.setLink('D', 'E', createLinkData());
    });

    it('should find nodes within 1 hop', () => {
      const nodes = graph.getNodesWithinHops('B', 1);
      expect(nodes.sort()).toEqual(['A', 'C', 'D']);
    });

    it('should find nodes within 2 hops', () => {
      const nodes = graph.getNodesWithinHops('A', 2);
      expect(nodes.sort()).toEqual(['B', 'C', 'D']);
    });

    it('should find all reachable nodes with high hop limit', () => {
      const nodes = graph.getNodesWithinHops('A', 10);
      expect(nodes.sort()).toEqual(['B', 'C', 'D', 'E']);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize graph', () => {
      graph.addNode('node-1', { lat: 40.0, lng: -80.0 }, { txPower: 20 });
      graph.addNode('node-2', { lat: 40.1, lng: -80.1 });
      graph.setLink('node-1', 'node-2', createLinkData({ distance: 5.0 }));

      const json = graph.toJSON();

      const newGraph = new LinkGraph();
      newGraph.fromJSON(json);

      expect(newGraph.getNodeCount()).toBe(2);
      expect(newGraph.getLinkCount()).toBe(1);
      expect(newGraph.getNode('node-1')?.txPower).toBe(20);
      expect(newGraph.getLink('node-1', 'node-2')?.distance).toBe(5.0);
    });

    it('should clear graph before loading JSON', () => {
      graph.addNode('old-node', { lat: 0, lng: 0 });

      graph.fromJSON({
        nodes: [{ id: 'new-node', data: { position: { lat: 1, lng: 1 } } }],
        links: [],
      });

      expect(graph.hasNode('old-node')).toBe(false);
      expect(graph.hasNode('new-node')).toBe(true);
    });
  });

  describe('batch operations', () => {
    it('should batch updates', () => {
      graph.beginUpdate();

      for (let i = 0; i < 100; i++) {
        graph.addNode(`node-${i}`, { lat: 40 + i * 0.01, lng: -80 });
      }

      graph.endUpdate();

      expect(graph.getNodeCount()).toBe(100);
    });
  });

  describe('stale link detection', () => {
    it('should find stale links', () => {
      const oldTime = Date.now() - 60000; // 1 minute ago
      const newTime = Date.now();

      graph.addNode('a', { lat: 40, lng: -80 });
      graph.addNode('b', { lat: 40.1, lng: -80 });
      graph.addNode('c', { lat: 40.2, lng: -80 });

      graph.setLink('a', 'b', createLinkData({ computedAt: oldTime }));
      graph.setLink('b', 'c', createLinkData({ computedAt: newTime }));

      const stale = graph.getStaleLinks(30000); // older than 30 seconds

      expect(stale).toHaveLength(1);
      expect(stale[0]!.from).toBe('a');
      expect(stale[0]!.to).toBe('b');
    });
  });

  describe('iteration', () => {
    it('should iterate over all nodes', () => {
      graph.addNode('a', { lat: 40, lng: -80 });
      graph.addNode('b', { lat: 40.1, lng: -80 });

      const ids: string[] = [];
      graph.forEachNode((id) => {
        ids.push(id);
      });

      expect(ids.sort()).toEqual(['a', 'b']);
    });

    it('should iterate over all links', () => {
      graph.addNode('a', { lat: 40, lng: -80 });
      graph.addNode('b', { lat: 40.1, lng: -80 });
      graph.setLink('a', 'b', createLinkData());

      const links: Array<{ from: string; to: string }> = [];
      graph.forEachLink((from, to) => {
        links.push({ from, to });
      });

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({ from: 'a', to: 'b' });
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      graph.addNode('a', { lat: 40, lng: -80 });
      graph.addNode('b', { lat: 40.1, lng: -80 });
      graph.setLink('a', 'b', createLinkData());

      graph.clear();

      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getLinkCount()).toBe(0);
    });
  });
});
