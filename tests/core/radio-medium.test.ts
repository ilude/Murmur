import { describe, it, expect } from 'vitest';
import { RadioMedium } from '@/core/radio-medium';
import { VirtualNode } from '@/core/node';
import { createPacket } from '@/core/packet';
import { createSeededRandom } from '@/utils/random';

describe('RadioMedium', () => {
  const createTestNode = (id: string, lat: number, lng: number) => {
    return new VirtualNode({
      id,
      position: { lat, lng },
      radioRange: 10,
      txPower: 20,
      dutyCycle: 0.1,
    });
  };

  describe('canHear', () => {
    it('should return true for nodes in range', () => {
      const radio = new RadioMedium();
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331); // ~1.2 km away

      expect(radio.canHear(nodeA, nodeB)).toBe(true);
    });

    it('should return false for nodes out of range', () => {
      const radio = new RadioMedium({ rxSensitivity: -100 }); // Less sensitive
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 48.6062, -122.3321); // ~111 km away

      expect(radio.canHear(nodeA, nodeB)).toBe(false);
    });

    it('should respect receiver sensitivity', () => {
      const sensitiveRadio = new RadioMedium({ rxSensitivity: -140 });
      const insensitiveRadio = new RadioMedium({ rxSensitivity: -100 });

      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.7062, -122.3321); // ~11 km away

      expect(sensitiveRadio.canHear(nodeA, nodeB)).toBe(true);
      expect(insensitiveRadio.canHear(nodeA, nodeB)).toBe(false);
    });
  });

  describe('calculateRssi', () => {
    it('should calculate RSSI based on distance', () => {
      const radio = new RadioMedium({ enableFading: false });
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331);

      const rssi = radio.calculateRssi(nodeA, nodeB);

      // RSSI should be less than tx power
      expect(rssi).toBeLessThan(nodeA.config.txPower);
      expect(rssi).toBeGreaterThan(-200);
    });

    it('should have lower RSSI for greater distance', () => {
      const radio = new RadioMedium({ enableFading: false });
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331); // Close
      const nodeC = createTestNode('c', 47.7062, -122.3321); // Far

      const rssiB = radio.calculateRssi(nodeA, nodeB);
      const rssiC = radio.calculateRssi(nodeA, nodeC);

      expect(rssiB).toBeGreaterThan(rssiC);
    });

    it('should add fading when enabled', () => {
      const random = createSeededRandom(12345);
      const radio = new RadioMedium({ enableFading: true }, random);

      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331);

      const rssi1 = radio.calculateRssi(nodeA, nodeB);
      const rssi2 = radio.calculateRssi(nodeA, nodeB);

      // With fading, RSSI should vary
      expect(rssi1).not.toBe(rssi2);
    });
  });

  describe('getNeighbors', () => {
    it('should return nodes in range', () => {
      const radio = new RadioMedium();
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331); // In range
      const nodeC = createTestNode('c', 48.6062, -122.3321); // Out of range

      const neighbors = radio.getNeighbors(nodeA, [nodeA, nodeB, nodeC]);

      expect(neighbors).toHaveLength(1);
      expect(neighbors[0]!.id).toBe('b');
    });

    it('should not include self', () => {
      const radio = new RadioMedium();
      const nodeA = createTestNode('a', 47.6062, -122.3321);

      const neighbors = radio.getNeighbors(nodeA, [nodeA]);

      expect(neighbors).toHaveLength(0);
    });
  });

  describe('getLinkBudget', () => {
    it('should calculate complete link budget', () => {
      const radio = new RadioMedium();
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331);

      const budget = radio.getLinkBudget(nodeA, nodeB);

      expect(budget.distance).toBeGreaterThan(0);
      expect(budget.pathLoss).toBeGreaterThan(0);
      expect(budget.rssi).toBeLessThan(nodeA.config.txPower);
      expect(budget.snr).toBeDefined();
      expect(budget.canReceive).toBeDefined();
    });

    it('should indicate reception possible for close nodes', () => {
      const radio = new RadioMedium();
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331);

      const budget = radio.getLinkBudget(nodeA, nodeB);

      expect(budget.canReceive).toBe(true);
    });

    it('should indicate reception not possible for far nodes', () => {
      const radio = new RadioMedium({ rxSensitivity: -100 });
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 48.6062, -122.3321);

      const budget = radio.getLinkBudget(nodeA, nodeB);

      expect(budget.canReceive).toBe(false);
    });
  });

  describe('transmit', () => {
    it('should deliver packet to nodes in range', () => {
      const radio = new RadioMedium();
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331);
      const nodeC = createTestNode('c', 47.6082, -122.3341);

      const packet = createPacket('a', 'broadcast', new Uint8Array([1]));
      const result = radio.transmit(nodeA, packet, [nodeA, nodeB, nodeC]);

      expect(result.reachedNodes.length).toBeGreaterThan(0);
      expect(result.reachedNodes.some((r) => r.node.id === 'b')).toBe(true);
    });

    it('should not include sender in reached nodes', () => {
      const radio = new RadioMedium();
      const nodeA = createTestNode('a', 47.6062, -122.3321);

      const packet = createPacket('a', 'broadcast', new Uint8Array([1]));
      const result = radio.transmit(nodeA, packet, [nodeA]);

      expect(result.reachedNodes.some((r) => r.node.id === 'a')).toBe(false);
    });

    it('should calculate propagation delay', () => {
      const radio = new RadioMedium();
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331);

      const packet = createPacket('a', 'b', new Uint8Array([1]));
      const result = radio.transmit(nodeA, packet, [nodeA, nodeB]);

      expect(result.reachedNodes[0]!.delay).toBeGreaterThanOrEqual(0);
    });

    it('should include RSSI for each reached node', () => {
      const radio = new RadioMedium({ enableFading: false });
      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.6072, -122.3331);

      const packet = createPacket('a', 'b', new Uint8Array([1]));
      const result = radio.transmit(nodeA, packet, [nodeA, nodeB]);

      expect(result.reachedNodes[0]!.rssi).toBeDefined();
      expect(result.reachedNodes[0]!.rssi).toBeLessThan(nodeA.config.txPower);
    });
  });

  describe('path loss models', () => {
    it('should use different path loss exponents', () => {
      const freeSpace = new RadioMedium({ pathLossExponent: 2, enableFading: false });
      const urban = new RadioMedium({ pathLossExponent: 3.5, enableFading: false });

      const nodeA = createTestNode('a', 47.6062, -122.3321);
      const nodeB = createTestNode('b', 47.7062, -122.3321);

      const rssiFreeSpace = freeSpace.calculateRssi(nodeA, nodeB);
      const rssiUrban = urban.calculateRssi(nodeA, nodeB);

      // Urban environment should have higher path loss (lower RSSI)
      expect(rssiUrban).toBeLessThan(rssiFreeSpace);
    });
  });
});
