import { describe, it, expect, beforeEach } from 'vitest';
import { ElevationCache } from '../../src/terrain/elevation-cache.js';

describe('ElevationCache', () => {
  let cache: ElevationCache;

  beforeEach(() => {
    cache = new ElevationCache();
  });

  describe('basic operations', () => {
    it('should store and retrieve elevation', () => {
      cache.set(40.8612, -79.8953, 350);
      expect(cache.get(40.8612, -79.8953)).toBe(350);
    });

    it('should return undefined for missing entries', () => {
      expect(cache.get(40.8612, -79.8953)).toBeUndefined();
    });

    it('should check if coordinate exists', () => {
      expect(cache.has(40.8612, -79.8953)).toBe(false);
      cache.set(40.8612, -79.8953, 350);
      expect(cache.has(40.8612, -79.8953)).toBe(true);
    });

    it('should track size', () => {
      expect(cache.size).toBe(0);
      cache.set(40.8612, -79.8953, 350);
      expect(cache.size).toBe(1);
      cache.set(40.8750, -79.9150, 400);
      expect(cache.size).toBe(2);
    });

    it('should clear all entries', () => {
      cache.set(40.8612, -79.8953, 350);
      cache.set(40.8750, -79.9150, 400);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get(40.8612, -79.8953)).toBeUndefined();
    });
  });

  describe('grid quantization', () => {
    it('should quantize nearby coordinates to same key', () => {
      // Default resolution is 0.001 degrees (~111m)
      cache.set(40.8612, -79.8953, 350);

      // Slightly different coordinate should hit same cache entry
      expect(cache.get(40.8612, -79.8953)).toBe(350);
      expect(cache.get(40.86124, -79.89534)).toBe(350);
    });

    it('should separate distant coordinates', () => {
      cache.set(40.8612, -79.8953, 350);
      cache.set(40.8750, -79.9150, 400);

      expect(cache.get(40.8612, -79.8953)).toBe(350);
      expect(cache.get(40.8750, -79.9150)).toBe(400);
    });
  });

  describe('batch operations', () => {
    it('should get multiple elevations', () => {
      cache.set(40.8612, -79.8953, 350);
      cache.set(40.8750, -79.9150, 400);

      const points = [
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 },
        { lat: 40.9000, lng: -80.0000 }, // not cached
      ];

      const result = cache.getMultiple(points);
      expect(result.size).toBe(3);
    });

    it('should set multiple elevations', () => {
      const points = [
        { lat: 40.8612, lng: -79.8953, elevation: 350 },
        { lat: 40.8750, lng: -79.9150, elevation: 400 },
      ];

      cache.setMultiple(points);
      expect(cache.get(40.8612, -79.8953)).toBe(350);
      expect(cache.get(40.8750, -79.9150)).toBe(400);
    });

    it('should find missing points', () => {
      cache.set(40.8612, -79.8953, 350);

      const points = [
        { lat: 40.8612, lng: -79.8953 }, // cached
        { lat: 40.8750, lng: -79.9150 }, // not cached
        { lat: 40.9000, lng: -80.0000 }, // not cached
      ];

      const missing = cache.getMissing(points);
      expect(missing.length).toBe(2);
    });

    it('should dedupe missing points', () => {
      const points = [
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8612, lng: -79.8953 }, // duplicate
        { lat: 40.86124, lng: -79.89534 }, // same grid cell
      ];

      const missing = cache.getMissing(points);
      expect(missing.length).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('should evict entries when at capacity', () => {
      const smallCache = new ElevationCache({ maxEntries: 10 });

      // Fill cache
      for (let i = 0; i < 10; i++) {
        smallCache.set(40 + i * 0.01, -79, i * 100);
      }
      expect(smallCache.size).toBe(10);

      // Add one more to trigger eviction
      smallCache.set(41, -79, 1000);

      // Size should be reduced (some evicted) but new entry added
      expect(smallCache.size).toBeLessThanOrEqual(10);

      // New entry should exist
      expect(smallCache.get(41, -79)).toBe(1000);
    });

    it('should not exceed max entries', () => {
      const smallCache = new ElevationCache({ maxEntries: 5 });

      // Add more than max
      for (let i = 0; i < 20; i++) {
        smallCache.set(40 + i * 0.01, -79, i * 100);
      }

      // Should never exceed max
      expect(smallCache.size).toBeLessThanOrEqual(5);
    });
  });
});
