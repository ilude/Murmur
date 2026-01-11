/**
 * Geographic utility functions for coordinate transformations and calculations
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LatLngBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const EARTH_RADIUS_KM = 6371;
const WEB_MERCATOR_HALF_WORLD = 20037508.34;

/**
 * Calculate the great-circle distance between two points using the Haversine formula
 * @returns Distance in kilometers
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const aLat = toRad(a.lat);
  const bLat = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(aLat) * Math.cos(bLat) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}

/**
 * Convert Web Mercator coordinates (meters) to lat/lng
 */
export function webMercatorToLatLng(x: number, y: number): LatLng {
  const lng = (x / WEB_MERCATOR_HALF_WORLD) * 180;
  const lat =
    (Math.atan(Math.exp((y / WEB_MERCATOR_HALF_WORLD) * Math.PI)) * 360) /
      Math.PI -
    90;

  return { lat, lng };
}

/**
 * Convert lat/lng to Web Mercator coordinates (meters)
 */
export function latLngToWebMercator(latLng: LatLng): { x: number; y: number } {
  const x = (latLng.lng * WEB_MERCATOR_HALF_WORLD) / 180;

  const latRad = (latLng.lat * Math.PI) / 180;
  const y =
    (Math.log(Math.tan(Math.PI / 4 + latRad / 2)) * WEB_MERCATOR_HALF_WORLD) /
    Math.PI;

  return { x, y };
}

/**
 * Calculate the initial bearing from point A to point B
 * @returns Bearing in degrees (0-360, where 0 is north)
 */
export function bearing(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLng = toRad(to.lng - from.lng);
  const fromLat = toRad(from.lat);
  const toLat = toRad(to.lat);

  const y = Math.sin(dLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);

  const bearingRad = Math.atan2(y, x);
  const bearingDeg = toDeg(bearingRad);

  return (bearingDeg + 360) % 360;
}

/**
 * Calculate a destination point given a starting point, bearing, and distance
 * @param from Starting point
 * @param bearingDeg Initial bearing in degrees
 * @param distanceKm Distance in kilometers
 * @returns Destination point
 */
export function destination(
  from: LatLng,
  bearingDeg: number,
  distanceKm: number
): LatLng {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const bearingRad = toRad(bearingDeg);
  const angularDistance = distanceKm / EARTH_RADIUS_KM;

  const fromLatRad = toRad(from.lat);
  const fromLngRad = toRad(from.lng);

  const toLat = Math.asin(
    Math.sin(fromLatRad) * Math.cos(angularDistance) +
      Math.cos(fromLatRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const toLng =
    fromLngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(fromLatRad),
      Math.cos(angularDistance) - Math.sin(fromLatRad) * Math.sin(toLat)
    );

  return {
    lat: toDeg(toLat),
    lng: toDeg(toLng),
  };
}

/**
 * Check if a point is within bounds
 */
export function isInBounds(point: LatLng, bounds: LatLngBounds): boolean {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}
