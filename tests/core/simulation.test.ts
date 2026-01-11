import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '@/core/simulation';
import { createFloodingStrategy } from '@/core/routing/flooding';

describe('Simulation', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation({ seed: 12345, syncMode: true });
  });

  describe('node management', () => {
    it('should add node to simulation', () => {
      const node = sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });

      expect(node.id).toBe('node-a');
      expect(sim.nodes.has('node-a')).toBe(true);
      expect(sim.getNode('node-a')).toBe(node);
    });

    it('should throw if adding duplicate node ID', () => {
      sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });

      expect(() => {
        sim.addNode({
          id: 'node-a',
          position: { lat: 47.6062, lng: -122.3321 },
          radioRange: 10,
          txPower: 20,
          dutyCycle: 0.1,
        });
      }).toThrow();
    });

    it('should remove node from simulation', () => {
      sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });

      sim.removeNode('node-a');

      expect(sim.nodes.has('node-a')).toBe(false);
      expect(sim.getNode('node-a')).toBeUndefined();
    });

    it('should throw if removing non-existent node', () => {
      expect(() => {
        sim.removeNode('non-existent');
      }).toThrow();
    });
  });

  describe('packet injection', () => {
    it('should inject packet into simulation', () => {
      const node = sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });
      node.setRoutingStrategy(createFloodingStrategy());

      const packetId = sim.injectPacket(
        'node-a',
        'node-b',
        new TextEncoder().encode('test')
      );

      expect(packetId).toBeDefined();
      // Packet is immediately transmitted, so outbox should be empty
      expect(node.outbox.length).toBe(0);
    });

    it('should throw if node not found', () => {
      expect(() => {
        sim.injectPacket('non-existent', 'dest', new Uint8Array([1]));
      }).toThrow();
    });
  });

  describe('packet transmission', () => {
    it('should transmit packets between nodes in range', () => {
      const nodeA = sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });
      const nodeB = sim.addNode({
        id: 'node-b',
        position: { lat: 47.6072, lng: -122.3331 }, // ~1.2 km away
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });

      nodeA.setRoutingStrategy(createFloodingStrategy());
      nodeB.setRoutingStrategy(createFloodingStrategy());

      sim.injectPacket('node-a', 'node-b', new TextEncoder().encode('test'));

      // Packet is immediately delivered in event-driven model
      expect(nodeB.inbox.length).toBeGreaterThan(0);
    });

    it('should emit packet events', () => {
      let created = false;
      let transmitted = false;
      let received = false;

      sim.on('packet:created', () => {
        created = true;
      });
      sim.on('packet:transmitted', () => {
        transmitted = true;
      });
      sim.on('packet:received', () => {
        received = true;
      });

      const nodeA = sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });
      const nodeB = sim.addNode({
        id: 'node-b',
        position: { lat: 47.6072, lng: -122.3331 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });

      nodeA.setRoutingStrategy(createFloodingStrategy());
      nodeB.setRoutingStrategy(createFloodingStrategy());

      sim.injectPacket('node-a', 'node-b', new TextEncoder().encode('test'));

      expect(created).toBe(true);
      expect(transmitted).toBe(true);
      expect(received).toBe(true);
    });
  });

  describe('topology', () => {
    it('should return network topology', () => {
      sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });
      sim.addNode({
        id: 'node-b',
        position: { lat: 47.6072, lng: -122.3331 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });

      const topology = sim.getTopology();

      expect(topology.nodes).toHaveLength(2);
      expect(topology.links.length).toBeGreaterThan(0);
    });

    it('should include neighbor information', () => {
      sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });
      sim.addNode({
        id: 'node-b',
        position: { lat: 47.6072, lng: -122.3331 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });

      const topology = sim.getTopology();
      const nodeA = topology.nodes.find((n) => n.id === 'node-a');

      expect(nodeA!.neighbors).toContain('node-b');
    });
  });

  describe('statistics', () => {
    it('should track simulation statistics', () => {
      const nodeA = sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });
      nodeA.setRoutingStrategy(createFloodingStrategy());

      sim.injectPacket('node-a', 'node-b', new TextEncoder().encode('test'));

      const stats = sim.getStats();

      expect(stats.totalPackets).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset simulation state', () => {
      const nodeA = sim.addNode({
        id: 'node-a',
        position: { lat: 47.6062, lng: -122.3321 },
        radioRange: 10,
        txPower: 20,
        dutyCycle: 0.1,
      });
      nodeA.setRoutingStrategy(createFloodingStrategy());

      sim.injectPacket('node-a', 'node-b', new TextEncoder().encode('test'));

      sim.reset();

      expect(nodeA.stats.packetsSent).toBe(0);
    });
  });

  describe('determinism', () => {
    it('should produce same results with same seed', () => {
      const sim1 = new Simulation({ seed: 12345, syncMode: true });
      const sim2 = new Simulation({ seed: 12345, syncMode: true });

      // Add same nodes
      for (const s of [sim1, sim2]) {
        const nodeA = s.addNode({
          id: 'node-a',
          position: { lat: 47.6062, lng: -122.3321 },
          radioRange: 10,
          txPower: 20,
          dutyCycle: 0.1,
        });
        const nodeB = s.addNode({
          id: 'node-b',
          position: { lat: 47.6072, lng: -122.3331 },
          radioRange: 10,
          txPower: 20,
          dutyCycle: 0.1,
        });
        nodeA.setRoutingStrategy(createFloodingStrategy());
        nodeB.setRoutingStrategy(createFloodingStrategy());

        s.injectPacket('node-a', 'node-b', new TextEncoder().encode('test'));
      }

      // Should have same state
      expect(sim1.getStats().totalPackets).toBe(sim2.getStats().totalPackets);
    });
  });
});
