import { describe, it, expect } from 'vitest';
import {
  createPacket,
  cloneForForward,
  serializePacket,
  deserializePacket,
} from '@/core/packet';

describe('packet', () => {
  describe('createPacket', () => {
    it('should create packet with required fields', () => {
      const payload = new TextEncoder().encode('Hello World');
      const packet = createPacket('node-a', 'node-b', payload);

      expect(packet.header.source).toBe('node-a');
      expect(packet.header.destination).toBe('node-b');
      expect(packet.header.hopLimit).toBe(7); // Default
      expect(packet.header.hopCount).toBe(0);
      expect(packet.payload).toEqual(payload);
      expect(packet.meta.path).toEqual(['node-a']);
    });

    it('should create packet with custom hop limit', () => {
      const payload = new Uint8Array([1, 2, 3]);
      const packet = createPacket('node-a', 'node-b', payload, 10);

      expect(packet.header.hopLimit).toBe(10);
    });

    it('should generate unique packet IDs', () => {
      const payload = new Uint8Array([1, 2, 3]);
      const packet1 = createPacket('node-a', 'node-b', payload);
      const packet2 = createPacket('node-a', 'node-b', payload);

      expect(packet1.header.id).not.toBe(packet2.header.id);
    });

    it('should set timestamp', () => {
      const before = Date.now();
      const payload = new Uint8Array([1, 2, 3]);
      const packet = createPacket('node-a', 'node-b', payload);
      const after = Date.now();

      expect(packet.header.timestamp).toBeGreaterThanOrEqual(before);
      expect(packet.header.timestamp).toBeLessThanOrEqual(after);
      expect(packet.meta.createdAt).toBeGreaterThanOrEqual(before);
      expect(packet.meta.createdAt).toBeLessThanOrEqual(after);
    });

    it('should handle empty payload', () => {
      const packet = createPacket('node-a', 'node-b', new Uint8Array(0));

      expect(packet.payload.length).toBe(0);
    });

    it('should handle broadcast destination', () => {
      const payload = new Uint8Array([1, 2, 3]);
      const packet = createPacket('node-a', 'broadcast', payload);

      expect(packet.header.destination).toBe('broadcast');
    });
  });

  describe('cloneForForward', () => {
    it('should create forwarded packet with decremented hop limit', () => {
      const original = createPacket('node-a', 'node-b', new Uint8Array([1]));
      const forwarded = cloneForForward(original, 'node-c');

      expect(forwarded).not.toBeNull();
      expect(forwarded!.header.hopLimit).toBe(original.header.hopLimit - 1);
      expect(forwarded!.header.hopCount).toBe(original.header.hopCount + 1);
    });

    it('should add forwarder to path', () => {
      const original = createPacket('node-a', 'node-b', new Uint8Array([1]));
      const forwarded = cloneForForward(original, 'node-c');

      expect(forwarded!.meta.path).toEqual(['node-a', 'node-c']);
    });

    it('should return null when hop limit exhausted', () => {
      const original = createPacket('node-a', 'node-b', new Uint8Array([1]), 0);
      const forwarded = cloneForForward(original, 'node-c');

      expect(forwarded).toBeNull();
    });

    it('should preserve packet ID', () => {
      const original = createPacket('node-a', 'node-b', new Uint8Array([1]));
      const forwarded = cloneForForward(original, 'node-c');

      expect(forwarded!.header.id).toBe(original.header.id);
    });

    it('should preserve payload', () => {
      const payload = new Uint8Array([1, 2, 3, 4, 5]);
      const original = createPacket('node-a', 'node-b', payload);
      const forwarded = cloneForForward(original, 'node-c');

      expect(forwarded!.payload).toEqual(payload);
    });
  });

  describe('serializePacket / deserializePacket', () => {
    it('should serialize and deserialize packet', () => {
      const payload = new TextEncoder().encode('Test Message');
      const original = createPacket('node-a', 'node-b', payload);

      const serialized = serializePacket(original);
      const deserialized = deserializePacket(serialized);

      expect(deserialized.header.id).toBe(original.header.id);
      expect(deserialized.header.source).toBe(original.header.source);
      expect(deserialized.header.destination).toBe(original.header.destination);
      expect(deserialized.header.hopLimit).toBe(original.header.hopLimit);
      expect(deserialized.header.hopCount).toBe(original.header.hopCount);
      expect(deserialized.header.timestamp).toBe(original.header.timestamp);
      expect(deserialized.payload).toEqual(original.payload);
    });

    it('should handle empty payload', () => {
      const original = createPacket('node-a', 'node-b', new Uint8Array(0));

      const serialized = serializePacket(original);
      const deserialized = deserializePacket(serialized);

      expect(deserialized.payload.length).toBe(0);
    });

    it('should handle large payload', () => {
      const payload = new Uint8Array(1000).fill(42);
      const original = createPacket('node-a', 'node-b', payload);

      const serialized = serializePacket(original);
      const deserialized = deserializePacket(serialized);

      expect(deserialized.payload).toEqual(payload);
    });

    it('should handle long node IDs', () => {
      const longId = 'very-long-node-identifier-with-many-characters';
      const original = createPacket(longId, 'node-b', new Uint8Array([1]));

      const serialized = serializePacket(original);
      const deserialized = deserializePacket(serialized);

      expect(deserialized.header.source).toBe(longId);
    });

    it('should handle broadcast destination', () => {
      const original = createPacket('node-a', 'broadcast', new Uint8Array([1]));

      const serialized = serializePacket(original);
      const deserialized = deserializePacket(serialized);

      expect(deserialized.header.destination).toBe('broadcast');
    });
  });
});
