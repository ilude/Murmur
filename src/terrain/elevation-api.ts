/**
 * Open-Meteo Elevation API client
 * https://open-meteo.com/en/docs/elevation-api
 */

import type { LatLng } from '../utils/geo.js';

export interface ElevationApiConfig {
  baseUrl: string;
  maxBatchSize: number; // API limit is 100
  timeoutMs: number;
}

export interface ElevationPoint extends LatLng {
  elevation: number | undefined;
}

const DEFAULT_CONFIG: ElevationApiConfig = {
  baseUrl: 'https://api.open-meteo.com/v1/elevation',
  maxBatchSize: 100,
  timeoutMs: 10000,
};

export class ElevationApi {
  private config: ElevationApiConfig;

  constructor(config: Partial<ElevationApiConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Fetch elevations for multiple points
   * Returns array of elevations in same order as input points
   * Undefined values indicate API failure for that point
   */
  async getElevations(points: LatLng[]): Promise<Array<number | undefined>> {
    if (points.length === 0) {
      return [];
    }

    // Split into batches
    const batches: LatLng[][] = [];
    for (let i = 0; i < points.length; i += this.config.maxBatchSize) {
      batches.push(points.slice(i, i + this.config.maxBatchSize));
    }

    // Fetch all batches
    const results: Array<number | undefined> = [];
    for (const batch of batches) {
      const batchResults = await this.fetchBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Fetch a single batch of elevations
   */
  private async fetchBatch(points: LatLng[]): Promise<Array<number | undefined>> {
    const latitudes = points.map((p) => p.lat.toFixed(6)).join(',');
    const longitudes = points.map((p) => p.lng.toFixed(6)).join(',');

    const url = `${this.config.baseUrl}?latitude=${latitudes}&longitude=${longitudes}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`Elevation API error: ${response.status} ${response.statusText}`);
        return points.map(() => undefined);
      }

      const data = (await response.json()) as { elevation: number[] };

      if (!data.elevation || !Array.isArray(data.elevation)) {
        console.warn('Elevation API returned unexpected format');
        return points.map(() => undefined);
      }

      return data.elevation;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Elevation API request timed out');
      } else {
        console.warn('Elevation API request failed:', error);
      }
      return points.map(() => undefined);
    }
  }

  /**
   * Fetch elevation for a single point
   */
  async getElevation(point: LatLng): Promise<number | undefined> {
    const results = await this.getElevations([point]);
    return results[0];
  }

  /**
   * Fetch elevations and return as ElevationPoint array
   */
  async getElevationPoints(points: LatLng[]): Promise<ElevationPoint[]> {
    const elevations = await this.getElevations(points);

    return points.map((point, i) => ({
      lat: point.lat,
      lng: point.lng,
      elevation: elevations[i],
    }));
  }
}
