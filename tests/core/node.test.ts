import { describe, it, expect } from 'vitest';
import { VirtualNode } from '@/core/node';
import { createPacket } from '@/core/packet';
import { createFloodingStrategy } from '@/core/routing/flooding';

describe('VirtualNode', () => {
  const createTestNode = (id: string) => {
    return new VirtualNode({
      id,
      position: { lat: 47.6062, lng: -122.3321 },
      radioRange: 10,
      txPower: 20,
      dutyCycle: 0.1,
    });
  };

  describe('constructor', () => {
    it('should create node with config', () => {
      const node = createTestNode('test-node');

      expect(node.id).toBe('test-node');
      expect(node.position).toEqual({ lat: 47.6062, lng: -122.3321 });
      expect(node.config.radioRange).toBe(10);
      expect(node.config.txPower).toBe(20);
      expect(node.config.dutyCycle).toBe(0.1);
    });

    it('should derive address from position', () => {
      const node = createTestNode('test-node');

      expect(node.address).toBeDefined();
      expect(node.address.octet1).toBeGreaterThan(0);
      expect(node.address.octet2).toBeGreaterThanOrEqual(0);
      expect(node.address.octet3).toBeGreaterThan(0);
    });

    it('should initialize stats to zero', () => {
      const node = createTestNode('test-node');

      expect(node.stats.packetsReceived).toBe(0);
      expect(node.stats.packetsSent).toBe(0);
      expect(node.stats.packetsDropped).toBe(0);
      expect(node.stats.packetsForwarded).toBe(0);
      expect(node.stats.duplicatesIgnored).toBe(0);
    });
  });

  describe('receive', () => {
    it('should receive new packet', () => {
      const node = createTestNode('test-node');
      node.setRoutingStrategy(createFloodingStrategy());

      const packet = createPacket('sender', 'test-node', new Uint8Array([1]));

      node.receive(packet, -80);

      expect(node.stats.packetsReceived).toBe(1);
      expect(node.inbox).toHaveLength(1);
      expect(node.seenPacketIds.has(packet.header.id)).toBe(true);
    });

    it('should ignore duplicate packets', () => {
      const node = createTestNode('test-node');
      node.setRoutingStrategy(createFloodingStrategy());

      const packet = createPacket('sender', 'test-node', new Uint8Array([1]));

      node.receive(packet, -80);
      node.receive(packet, -80);

      expect(node.stats.packetsReceived).toBe(2);
      expect(node.stats.duplicatesIgnored).toBe(1);
      expect(node.inbox).toHaveLength(1);
    });

    it('should forward packets not for this node', () => {
      const node = createTestNode('test-node');
      node.setRoutingStrategy(createFloodingStrategy());

      const packet = createPacket('sender', 'other-node', new Uint8Array([1]));

      node.receive(packet, -80);

      expect(node.stats.packetsForwarded).toBe(1);
      expect(node.outbox.length).toBeGreaterThan(0);
    });

    it('should handle broadcast packets', () => {
      const node = createTestNode('test-node');
      node.setRoutingStrategy(createFloodingStrategy());

      const packet = createPacket('sender', 'broadcast', new Uint8Array([1]));

      node.receive(packet, -80);

      expect(node.inbox).toHaveLength(1);
      expect(node.stats.packetsForwarded).toBe(1);
    });
  });

  describe('send', () => {
    it('should create and queue packet for sending', () => {
      const node = createTestNode('test-node');
      node.setRoutingStrategy(createFloodingStrategy());

      const packetId = node.send('destination', new Uint8Array([1, 2, 3]));

      expect(packetId).toBeDefined();
      expect(node.stats.packetsSent).toBe(1);
      expect(node.outbox).toHaveLength(1);
    });

    it('should throw if no routing strategy set', () => {
      const node = createTestNode('test-node');

      expect(() => {
        node.send('destination', new Uint8Array([1]));
      }).toThrow();
    });
  });

  describe('seen packet cleanup', () => {
    it('should clean up old seen packet IDs on receive when over limit', () => {
      const node = createTestNode('test-node');
      node.setRoutingStrategy(createFloodingStrategy());

      // Add many seen packet IDs
      for (let i = 0; i < 1001; i++) {
        node.seenPacketIds.add(`packet-${i}`);
      }

      // Receive a new packet to trigger cleanup
      const packet = createPacket('sender', 'test-node', new Uint8Array([1]));
      node.receive(packet, -80);

      // Should clean up some IDs
      expect(node.seenPacketIds.size).toBeLessThan(1002);
    });
  });

  describe('reset', () => {
    it('should reset node state', () => {
      const node = createTestNode('test-node');
      node.setRoutingStrategy(createFloodingStrategy());

      // Create some activity
      node.send('destination', new Uint8Array([1]));
      const packet = createPacket('sender', 'test-node', new Uint8Array([1]));
      node.receive(packet, -80);

      node.reset();

      expect(node.stats.packetsSent).toBe(0);
      expect(node.stats.packetsReceived).toBe(0);
      expect(node.inbox).toHaveLength(0);
      expect(node.outbox).toHaveLength(0);
      expect(node.seenPacketIds.size).toBe(0);
    });
  });

  describe('updatePosition', () => {
    it('should update position and recalculate address', () => {
      const node = createTestNode('test-node');
      const originalAddress = { ...node.address };

      const newPosition = { lat: 40.7128, lng: -74.006 };
      node.updatePosition(newPosition);

      expect(node.position).toEqual(newPosition);
      expect(node.address.octet1).not.toBe(originalAddress.octet1);
    });
  });

  describe('getFormattedAddress', () => {
    it('should return formatted address string', () => {
      const node = createTestNode('test-node');

      const formatted = node.getFormattedAddress();

      expect(formatted).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
