/**
 * Terrain awareness module for LOS calculations
 */

export { ElevationCache } from './elevation-cache.js';
export type { ElevationCacheConfig } from './elevation-cache.js';

export { ElevationApi } from './elevation-api.js';
export type { ElevationApiConfig, ElevationPoint } from './elevation-api.js';

export { LOSCalculator } from './los-calculator.js';
export type {
  LOSConfig,
  LOSResult,
  TerrainProfilePoint,
} from './los-calculator.js';
