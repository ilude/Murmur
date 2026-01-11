/**
 * Grid-based elevation cache with LRU eviction
 */

export interface ElevationCacheConfig {
  gridResolutionDegrees: number; // 0.001 = ~111m at equator
  maxEntries: number; // LRU eviction threshold
}

const DEFAULT_CONFIG: ElevationCacheConfig = {
  gridResolutionDegrees: 0.001, // ~111m, matches SRTM 90m data
  maxEntries: 10000,
};

interface CacheEntry {
  elevation: number;
  lastAccess: number;
}

export class ElevationCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: ElevationCacheConfig;

  constructor(config: Partial<ElevationCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Quantize coordinates to grid resolution
   */
  private toKey(lat: number, lng: number): string {
    const res = this.config.gridResolutionDegrees;
    const qLat = Math.round(lat / res) * res;
    const qLng = Math.round(lng / res) * res;
    return `${qLat.toFixed(4)}_${qLng.toFixed(4)}`;
  }

  /**
   * Get elevation for a coordinate (returns undefined if not cached)
   */
  get(lat: number, lng: number): number | undefined {
    const key = this.toKey(lat, lng);
    const entry = this.cache.get(key);

    if (entry) {
      entry.lastAccess = Date.now();
      return entry.elevation;
    }

    return undefined;
  }

  /**
   * Store elevation for a coordinate
   */
  set(lat: number, lng: number, elevation: number): void {
    const key = this.toKey(lat, lng);

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      elevation,
      lastAccess: Date.now(),
    });
  }

  /**
   * Check if coordinate is cached
   */
  has(lat: number, lng: number): boolean {
    return this.cache.has(this.toKey(lat, lng));
  }

  /**
   * Get multiple elevations, returning map of key -> elevation | undefined
   */
  getMultiple(
    points: Array<{ lat: number; lng: number }>
  ): Map<string, number | undefined> {
    const result = new Map<string, number | undefined>();

    for (const point of points) {
      const key = this.toKey(point.lat, point.lng);
      const elevation = this.get(point.lat, point.lng);
      result.set(key, elevation);
    }

    return result;
  }

  /**
   * Set multiple elevations
   */
  setMultiple(points: Array<{ lat: number; lng: number; elevation: number }>): void {
    for (const point of points) {
      this.set(point.lat, point.lng, point.elevation);
    }
  }

  /**
   * Find points that are not in cache
   */
  getMissing(
    points: Array<{ lat: number; lng: number }>
  ): Array<{ lat: number; lng: number }> {
    const missing: Array<{ lat: number; lng: number }> = [];
    const seen = new Set<string>();

    for (const point of points) {
      const key = this.toKey(point.lat, point.lng);
      if (!seen.has(key) && !this.cache.has(key)) {
        missing.push(point);
        seen.add(key);
      }
    }

    return missing;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get number of cached entries
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict oldest 10% of entries
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    const toEvict = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toEvict; i++) {
      const entry = entries[i];
      if (entry) {
        this.cache.delete(entry[0]);
      }
    }
  }
}
