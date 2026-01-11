/**
 * Line of Sight (LOS) calculator with terrain awareness
 * Implements Fresnel zone clearance and Earth curvature corrections
 */

import type { LatLng } from '../utils/geo.js';
import { haversineDistance, interpolatePoints } from '../utils/geo.js';
import { ElevationApi } from './elevation-api.js';
import { ElevationCache } from './elevation-cache.js';

export interface LOSConfig {
  samplePoints: number; // Number of terrain samples (default: 15)
  fresnelClearance: number; // Required clearance as fraction of first Fresnel zone (default: 0.6)
  frequencyMHz: number; // Radio frequency for Fresnel calculation (default: 915)
  antennaHeightM: number; // Antenna height above ground (default: 2)
  kFactor: number; // Atmospheric refraction factor (default: 4/3 for standard atmosphere)
}

export interface TerrainProfilePoint {
  position: LatLng;
  distanceKm: number;
  groundElevationM: number;
  losHeightM: number; // Line of sight height at this point
  fresnelRadiusM: number;
  clearanceM: number; // losHeight - (groundElevation + curvatureCorrection)
  isObstructed: boolean;
}

export interface LOSResult {
  hasLOS: boolean;
  worstClearanceM: number; // Minimum clearance along path
  worstClearancePercent: number; // As percentage of required Fresnel clearance
  obstructionPoint?: LatLng | undefined;
  terrainProfile: TerrainProfilePoint[];
}

const DEFAULT_CONFIG: LOSConfig = {
  samplePoints: 15,
  fresnelClearance: 0.6, // 60% of first Fresnel zone
  frequencyMHz: 915, // LoRa frequency
  antennaHeightM: 2, // Typical handheld/mounted height
  kFactor: 4 / 3, // Standard atmosphere
};

const EARTH_RADIUS_KM = 6371;
const SPEED_OF_LIGHT_M_S = 299792458;

export class LOSCalculator {
  private config: LOSConfig;
  private api: ElevationApi;
  private cache: ElevationCache;

  constructor(
    config: Partial<LOSConfig> = {},
    api?: ElevationApi,
    cache?: ElevationCache
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.api = api ?? new ElevationApi();
    this.cache = cache ?? new ElevationCache();
  }

  /**
   * Calculate Earth curvature correction at a point along the path
   * Returns height in meters that terrain appears to "rise" due to curvature
   */
  private earthCurvatureCorrection(distanceFromTxKm: number, totalDistanceKm: number): number {
    const d1 = distanceFromTxKm;
    const d2 = totalDistanceKm - distanceFromTxKm;

    // h = (d1 * d2) / (2 * R * k)
    // Convert to meters
    return ((d1 * d2) / (2 * EARTH_RADIUS_KM * this.config.kFactor)) * 1000;
  }

  /**
   * Calculate first Fresnel zone radius at a point along the path
   * Returns radius in meters
   */
  private fresnelRadius(distanceFromTxKm: number, distanceFromRxKm: number): number {
    // Skip calculation at endpoints
    if (distanceFromTxKm <= 0 || distanceFromRxKm <= 0) {
      return 0;
    }

    // wavelength = c / f (in meters)
    const wavelengthM = SPEED_OF_LIGHT_M_S / (this.config.frequencyMHz * 1e6);

    // d1 and d2 in meters
    const d1 = distanceFromTxKm * 1000;
    const d2 = distanceFromRxKm * 1000;

    // First Fresnel zone radius: r = sqrt(n * lambda * d1 * d2 / (d1 + d2))
    // For n = 1 (first Fresnel zone)
    return Math.sqrt((wavelengthM * d1 * d2) / (d1 + d2));
  }

  /**
   * Fetch elevations for points, using cache where available
   */
  private async getElevations(points: LatLng[]): Promise<Array<number | undefined>> {
    // Check cache first
    const elevations: Array<number | undefined> = new Array(points.length);
    const missingIndices: number[] = [];
    const missingPoints: LatLng[] = [];

    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const cached = this.cache.get(point.lat, point.lng);
      if (cached !== undefined) {
        elevations[i] = cached;
      } else {
        missingIndices.push(i);
        missingPoints.push(point);
      }
    }

    // Fetch missing from API
    if (missingPoints.length > 0) {
      const fetched = await this.api.getElevations(missingPoints);

      for (let j = 0; j < missingIndices.length; j++) {
        const idx = missingIndices[j]!;
        const elevation = fetched[j];
        elevations[idx] = elevation;

        // Cache the result
        if (elevation !== undefined) {
          const point = missingPoints[j]!;
          this.cache.set(point.lat, point.lng, elevation);
        }
      }
    }

    return elevations;
  }

  /**
   * Check line of sight between two points
   */
  async checkLOS(from: LatLng, to: LatLng): Promise<LOSResult> {
    const totalDistance = haversineDistance(from, to);

    // For very short distances, assume LOS
    if (totalDistance < 0.01) {
      // < 10m
      return {
        hasLOS: true,
        worstClearanceM: Infinity,
        worstClearancePercent: 100,
        terrainProfile: [],
      };
    }

    // Sample terrain along path
    const samplePoints = interpolatePoints(from, to, this.config.samplePoints);
    const elevations = await this.getElevations(samplePoints);

    // Handle case where we couldn't get elevations
    const validElevations = elevations.filter((e) => e !== undefined);
    if (validElevations.length < 2) {
      // Can't determine LOS without elevation data - assume clear
      return {
        hasLOS: true,
        worstClearanceM: 0,
        worstClearancePercent: 0,
        terrainProfile: [],
      };
    }

    // Get transmitter and receiver elevations
    const txGroundElevation = elevations[0] ?? 0;
    const rxGroundElevation = elevations[elevations.length - 1] ?? 0;

    const txHeight = txGroundElevation + this.config.antennaHeightM;
    const rxHeight = rxGroundElevation + this.config.antennaHeightM;

    // Build terrain profile
    const profile: TerrainProfilePoint[] = [];
    let worstClearanceM = Infinity;
    let worstClearancePercent = 100;
    let obstructionPoint: LatLng | undefined;
    let hasObstruction = false;

    for (let i = 0; i < samplePoints.length; i++) {
      const point = samplePoints[i]!;
      const groundElevation = elevations[i] ?? 0;
      const distFromTx = haversineDistance(from, point);
      const distFromRx = totalDistance - distFromTx;

      // Calculate LOS height at this point (linear interpolation)
      const fraction = distFromTx / totalDistance;
      const losHeight = txHeight + (rxHeight - txHeight) * fraction;

      // Earth curvature correction
      const curvatureCorrection = this.earthCurvatureCorrection(distFromTx, totalDistance);

      // Effective ground height
      const effectiveGround = groundElevation + curvatureCorrection;

      // Fresnel zone radius at this point
      const fresnel = this.fresnelRadius(distFromTx, distFromRx);
      const requiredClearance = fresnel * this.config.fresnelClearance;

      // Actual clearance
      const clearance = losHeight - effectiveGround;

      // Check if obstructed
      const isObstructed = clearance < requiredClearance;

      // Track worst clearance
      const clearancePercent =
        requiredClearance > 0 ? (clearance / requiredClearance) * 100 : 100;

      if (clearance < worstClearanceM) {
        worstClearanceM = clearance;
        worstClearancePercent = clearancePercent;
        if (isObstructed) {
          obstructionPoint = point;
        }
      }

      if (isObstructed) {
        hasObstruction = true;
      }

      profile.push({
        position: point,
        distanceKm: distFromTx,
        groundElevationM: groundElevation,
        losHeightM: losHeight,
        fresnelRadiusM: fresnel,
        clearanceM: clearance,
        isObstructed,
      });
    }

    return {
      hasLOS: !hasObstruction,
      worstClearanceM,
      worstClearancePercent,
      obstructionPoint,
      terrainProfile: profile,
    };
  }

  /**
   * Get terrain profile between two points (without LOS check)
   */
  async getTerrainProfile(from: LatLng, to: LatLng): Promise<TerrainProfilePoint[]> {
    const result = await this.checkLOS(from, to);
    return result.terrainProfile;
  }

  /**
   * Pre-fetch elevations for a set of points
   * Useful for warming the cache before running simulations
   */
  async prefetchElevations(points: LatLng[]): Promise<void> {
    const missing = this.cache.getMissing(points);
    if (missing.length > 0) {
      const elevations = await this.api.getElevations(missing);
      for (let i = 0; i < missing.length; i++) {
        const point = missing[i]!;
        const elevation = elevations[i];
        if (elevation !== undefined) {
          this.cache.set(point.lat, point.lng, elevation);
        }
      }
    }
  }

  /**
   * Get the elevation cache (for sharing between instances)
   */
  getCache(): ElevationCache {
    return this.cache;
  }
}
