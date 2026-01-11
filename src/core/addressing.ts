/**
 * Grid-based addressing system that maps geographic coordinates to mesh addresses
 *
 * Address format: Octet1.Octet2.Octet3
 * - Octet1: RegionY + 1 (1-255, 0 reserved)
 * - Octet2: RegionX (0-255)
 * - Octet3: Cell12 (1-4095, 0 reserved)
 *
 * The world is divided into N×N regions, each subdivided into 64×64 cells
 */

import type { LatLng, LatLngBounds } from '../utils/geo.js';
import { latLngToWebMercator, webMercatorToLatLng } from '../utils/geo.js';

export interface MeshAddress {
  octet1: number; // RegionY + 1 (1-255, 0 reserved)
  octet2: number; // RegionX (0-255)
  octet3: number; // Cell12 (1-4095, 0 reserved)

  // Convenience properties
  regionX: number;
  regionY: number;
  cellX: number;
  cellY: number;
}

export interface AddressingConfig {
  regionCount: number; // N (e.g., 229 for 250km regions)
  cellsPerRegion: number; // 64 (for 64x64 cells)
  projection: 'webMercator' | 'equirectangular';
}

const DEFAULT_CONFIG: AddressingConfig = {
  regionCount: 229,
  cellsPerRegion: 64,
  projection: 'webMercator',
};

// Web Mercator world size in meters
const WEB_MERCATOR_WORLD_SIZE = 20037508.34 * 2;

/**
 * Convert lat/lng to mesh address based on grid system
 */
export function latLngToAddress(
  lat: number,
  lng: number,
  config: AddressingConfig = DEFAULT_CONFIG
): MeshAddress {
  const { regionCount, cellsPerRegion, projection } = config;

  let gridX: number, gridY: number;

  if (projection === 'webMercator') {
    // Use Web Mercator projection
    const mercator = latLngToWebMercator({ lat, lng });

    // Normalize to [0, 1] range
    const normalizedX = (mercator.x + WEB_MERCATOR_WORLD_SIZE / 2) / WEB_MERCATOR_WORLD_SIZE;
    const normalizedY = (mercator.y + WEB_MERCATOR_WORLD_SIZE / 2) / WEB_MERCATOR_WORLD_SIZE;

    // Convert to grid coordinates
    gridX = normalizedX * regionCount * cellsPerRegion;
    gridY = normalizedY * regionCount * cellsPerRegion;
  } else {
    // Equirectangular projection (simple lat/lng)
    const normalizedLng = (lng + 180) / 360;
    const normalizedLat = (lat + 90) / 180;

    gridX = normalizedLng * regionCount * cellsPerRegion;
    gridY = normalizedLat * regionCount * cellsPerRegion;
  }

  // Clamp to valid range
  gridX = Math.max(0, Math.min(gridX, regionCount * cellsPerRegion - 1));
  gridY = Math.max(0, Math.min(gridY, regionCount * cellsPerRegion - 1));

  // Calculate region and cell coordinates
  const regionX = Math.floor(gridX / cellsPerRegion);
  const regionY = Math.floor(gridY / cellsPerRegion);
  const cellX = Math.floor(gridX % cellsPerRegion);
  const cellY = Math.floor(gridY % cellsPerRegion);

  // Convert to address octets
  const octet1 = regionY + 1; // RegionY + 1 (0 is reserved)
  const octet2 = regionX;

  // Cell12 is a 12-bit value combining cellX and cellY (6 bits each)
  const octet3 = (cellY << 6) | cellX;

  return {
    octet1,
    octet2,
    octet3,
    regionX,
    regionY,
    cellX,
    cellY,
  };
}

/**
 * Convert mesh address to lat/lng (center of cell)
 */
export function addressToLatLng(
  address: MeshAddress,
  config: AddressingConfig = DEFAULT_CONFIG
): LatLng {
  const { regionCount, cellsPerRegion, projection } = config;

  const { regionX, regionY, cellX, cellY } = address;

  // Calculate grid coordinates (center of cell)
  const gridX = regionX * cellsPerRegion + cellX + 0.5;
  const gridY = regionY * cellsPerRegion + cellY + 0.5;

  if (projection === 'webMercator') {
    // Convert from grid to normalized coordinates
    const normalizedX = gridX / (regionCount * cellsPerRegion);
    const normalizedY = gridY / (regionCount * cellsPerRegion);

    // Convert to Web Mercator meters
    const mercatorX = normalizedX * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;
    const mercatorY = normalizedY * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;

    return webMercatorToLatLng(mercatorX, mercatorY);
  } else {
    // Equirectangular projection
    const normalizedLng = gridX / (regionCount * cellsPerRegion);
    const normalizedLat = gridY / (regionCount * cellsPerRegion);

    return {
      lng: normalizedLng * 360 - 180,
      lat: normalizedLat * 180 - 90,
    };
  }
}

/**
 * Format mesh address as string "Octet1.Octet2.Octet3"
 */
export function formatAddress(address: MeshAddress): string {
  return `${address.octet1}.${address.octet2}.${address.octet3}`;
}

/**
 * Parse mesh address from string format
 */
export function parseAddress(str: string): MeshAddress | null {
  const parts = str.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const octet1 = parseInt(parts[0]!, 10);
  const octet2 = parseInt(parts[1]!, 10);
  const octet3 = parseInt(parts[2]!, 10);

  if (
    isNaN(octet1) || isNaN(octet2) || isNaN(octet3) ||
    octet1 < 1 || octet1 > 255 ||
    octet2 < 0 || octet2 > 255 ||
    octet3 < 1 || octet3 > 4095
  ) {
    return null;
  }

  const regionY = octet1 - 1;
  const regionX = octet2;
  const cellY = (octet3 >> 6) & 0x3F;
  const cellX = octet3 & 0x3F;

  return {
    octet1,
    octet2,
    octet3,
    regionX,
    regionY,
    cellX,
    cellY,
  };
}

/**
 * Get the geographic bounds of a region
 */
export function getRegionBounds(
  regionX: number,
  regionY: number,
  config: AddressingConfig = DEFAULT_CONFIG
): LatLngBounds {
  const { regionCount, cellsPerRegion, projection } = config;

  const gridX1 = regionX * cellsPerRegion;
  const gridY1 = regionY * cellsPerRegion;
  const gridX2 = (regionX + 1) * cellsPerRegion;
  const gridY2 = (regionY + 1) * cellsPerRegion;

  if (projection === 'webMercator') {
    const normalizedX1 = gridX1 / (regionCount * cellsPerRegion);
    const normalizedY1 = gridY1 / (regionCount * cellsPerRegion);
    const normalizedX2 = gridX2 / (regionCount * cellsPerRegion);
    const normalizedY2 = gridY2 / (regionCount * cellsPerRegion);

    const mercatorX1 = normalizedX1 * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;
    const mercatorY1 = normalizedY1 * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;
    const mercatorX2 = normalizedX2 * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;
    const mercatorY2 = normalizedY2 * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;

    const sw = webMercatorToLatLng(mercatorX1, mercatorY1);
    const ne = webMercatorToLatLng(mercatorX2, mercatorY2);

    return {
      south: sw.lat,
      west: sw.lng,
      north: ne.lat,
      east: ne.lng,
    };
  } else {
    const normalizedLng1 = gridX1 / (regionCount * cellsPerRegion);
    const normalizedLat1 = gridY1 / (regionCount * cellsPerRegion);
    const normalizedLng2 = gridX2 / (regionCount * cellsPerRegion);
    const normalizedLat2 = gridY2 / (regionCount * cellsPerRegion);

    return {
      west: normalizedLng1 * 360 - 180,
      south: normalizedLat1 * 180 - 90,
      east: normalizedLng2 * 360 - 180,
      north: normalizedLat2 * 180 - 90,
    };
  }
}

/**
 * Get the geographic bounds of a cell
 */
export function getCellBounds(
  address: MeshAddress,
  config: AddressingConfig = DEFAULT_CONFIG
): LatLngBounds {
  const { regionCount, cellsPerRegion, projection } = config;
  const { regionX, regionY, cellX, cellY } = address;

  const gridX1 = regionX * cellsPerRegion + cellX;
  const gridY1 = regionY * cellsPerRegion + cellY;
  const gridX2 = gridX1 + 1;
  const gridY2 = gridY1 + 1;

  if (projection === 'webMercator') {
    const normalizedX1 = gridX1 / (regionCount * cellsPerRegion);
    const normalizedY1 = gridY1 / (regionCount * cellsPerRegion);
    const normalizedX2 = gridX2 / (regionCount * cellsPerRegion);
    const normalizedY2 = gridY2 / (regionCount * cellsPerRegion);

    const mercatorX1 = normalizedX1 * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;
    const mercatorY1 = normalizedY1 * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;
    const mercatorX2 = normalizedX2 * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;
    const mercatorY2 = normalizedY2 * WEB_MERCATOR_WORLD_SIZE - WEB_MERCATOR_WORLD_SIZE / 2;

    const sw = webMercatorToLatLng(mercatorX1, mercatorY1);
    const ne = webMercatorToLatLng(mercatorX2, mercatorY2);

    return {
      south: sw.lat,
      west: sw.lng,
      north: ne.lat,
      east: ne.lng,
    };
  } else {
    const normalizedLng1 = gridX1 / (regionCount * cellsPerRegion);
    const normalizedLat1 = gridY1 / (regionCount * cellsPerRegion);
    const normalizedLng2 = gridX2 / (regionCount * cellsPerRegion);
    const normalizedLat2 = gridY2 / (regionCount * cellsPerRegion);

    return {
      west: normalizedLng1 * 360 - 180,
      south: normalizedLat1 * 180 - 90,
      east: normalizedLng2 * 360 - 180,
      north: normalizedLat2 * 180 - 90,
    };
  }
}
