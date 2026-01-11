import { describe, it, expect } from 'vitest';
import { createFloodingStrategy } from '@/core/routing/flooding';
import { VirtualNode } from '@/core/node';
import { createPacket } from '@/core/packet';

describe('FloodingStrategy', () => {
  const createTestNode = (id: string) => {
    return new VirtualNode({
      id,
      position: { lat: 47.6062, lng: -122.3321 },
      radioRange: 10,
      txPower: 20,
      dutyCycle: 0.1,
    });
  };

  describe('onReceive', () => {
    it('should deliver packet addressed to this node', () => {
      const strategy = createFloodingStrategy();
      const node = createTestNode('test-node');
      const packet = createPacket('sender', 'test-node', new Uint8Array([1]));

      const decision = strategy.onReceive(node, packet, -80);

      expect(decision.action).toBe('deliver');
      expect(decision.reason).toContain('addressed to this node');
    });

    it('should forward packet addressed to other node', () => {
      const strategy = createFloodingStrategy();
      const node = createTestNode('test-node');
      const packet = createPacket('sender', 'other-node', new Uint8Array([1]));

      const decision = strategy.onReceive(node, packet, -80);

      expect(decision.action).toBe('forward');
      expect(decision.modifiedPacket).toBeDefined();
      expect(decision.modifiedPacket!.header.hopLimit).toBe(
        packet.header.hopLimit - 1
      );
    });

    it('should forward broadcast packets', () => {
      const strategy = createFloodingStrategy();
      const node = createTestNode('test-node');
      const packet = createPacket('sender', 'broadcast', new Uint8Array([1]));

      const decision = strategy.onReceive(node, packet, -80);

      expect(decision.action).toBe('forward');
      expect(decision.reason).toContain('broadcast');
    });

    it('should drop packet when hop limit exhausted', () => {
      const strategy = createFloodingStrategy();
      const node = createTestNode('test-node');
      const packet = createPacket('sender', 'other-node', new Uint8Array([1]), 0);

      const decision = strategy.onReceive(node, packet, -80);

      expect(decision.action).toBe('drop');
      expect(decision.reason.toLowerCase()).toContain('hop limit');
    });

    it('should include rebroadcast delay for forwarding', () => {
      const strategy = createFloodingStrategy({ rebroadcastDelay: 200 });
      const node = createTestNode('test-node');
      const packet = createPacket('sender', 'other-node', new Uint8Array([1]));

      const decision = strategy.onReceive(node, packet, -80);

      expect(decision.delay).toBe(200);
    });

    it('should decrement hop limit when forwarding', () => {
      const strategy = createFloodingStrategy();
      const node = createTestNode('test-node');
      const packet = createPacket('sender', 'other-node', new Uint8Array([1]), 5);

      const decision = strategy.onReceive(node, packet, -80);

      expect(decision.modifiedPacket!.header.hopLimit).toBe(4);
      expect(decision.modifiedPacket!.header.hopCount).toBe(1);
    });
  });

  describe('onSend', () => {
    it('should create packet with default hop limit', () => {
      const strategy = createFloodingStrategy({ defaultHopLimit: 10 });
      const node = createTestNode('test-node');
      const payload = new Uint8Array([1, 2, 3]);

      const packet = strategy.onSend(node, 'destination', payload);

      expect(packet.header.source).toBe('test-node');
      expect(packet.header.destination).toBe('destination');
      expect(packet.header.hopLimit).toBe(10);
      expect(packet.payload).toEqual(payload);
    });

    it('should create broadcast packet', () => {
      const strategy = createFloodingStrategy();
      const node = createTestNode('test-node');

      const packet = strategy.onSend(node, 'broadcast', new Uint8Array([1]));

      expect(packet.header.destination).toBe('broadcast');
    });
  });

  describe('onTick', () => {
    it('should not perform any action on tick', () => {
      const strategy = createFloodingStrategy();
      const node = createTestNode('test-node');

      // Should not throw
      expect(() => {
        strategy.onTick(node, 100);
      }).not.toThrow();
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const strategy = createFloodingStrategy({
        defaultHopLimit: 15,
        rebroadcastDelay: 500,
      });
      const node = createTestNode('test-node');

      const packet = strategy.onSend(node, 'dest', new Uint8Array([1]));

      expect(packet.header.hopLimit).toBe(15);
    });
  });
});
