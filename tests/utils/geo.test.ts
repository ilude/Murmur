import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  webMercatorToLatLng,
  latLngToWebMercator,
  bearing,
  destination,
  isInBounds,
  type LatLng,
  type LatLngBounds,
} from '@/utils/geo';

describe('geo utilities', () => {
  describe('haversineDistance', () => {
    it('should calculate distance between Seattle and Portland', () => {
      const seattle: LatLng = { lat: 47.6062, lng: -122.3321 };
      const portland: LatLng = { lat: 45.5152, lng: -122.6784 };

      const distance = haversineDistance(seattle, portland);

      // Actual distance is approximately 234 km
      expect(distance).toBeCloseTo(234, 0);
    });

    it('should return 0 for same point', () => {
      const point: LatLng = { lat: 40.7128, lng: -74.006 };

      const distance = haversineDistance(point, point);

      expect(distance).toBe(0);
    });

    it('should calculate distance across dateline', () => {
      const pointA: LatLng = { lat: 0, lng: 179 };
      const pointB: LatLng = { lat: 0, lng: -179 };

      const distance = haversineDistance(pointA, pointB);

      // Should be about 222 km (2 degrees at equator)
      expect(distance).toBeCloseTo(222, 0);
    });

    it('should calculate distance to north pole', () => {
      const equator: LatLng = { lat: 0, lng: 0 };
      const northPole: LatLng = { lat: 90, lng: 0 };

      const distance = haversineDistance(equator, northPole);

      // Quarter of Earth's circumference: ~10,007 km
      expect(distance).toBeGreaterThan(10000);
      expect(distance).toBeLessThan(10020);
    });
  });

  describe('Web Mercator transformations', () => {
    it('should convert lat/lng to Web Mercator and back', () => {
      const original: LatLng = { lat: 47.6062, lng: -122.3321 };

      const mercator = latLngToWebMercator(original);
      const restored = webMercatorToLatLng(mercator.x, mercator.y);

      expect(restored.lat).toBeCloseTo(original.lat, 4);
      expect(restored.lng).toBeCloseTo(original.lng, 4);
    });

    it('should handle equator (0, 0)', () => {
      const equator: LatLng = { lat: 0, lng: 0 };

      const mercator = latLngToWebMercator(equator);

      expect(mercator.x).toBeCloseTo(0, 1);
      expect(mercator.y).toBeCloseTo(0, 1);
    });

    it('should handle date line', () => {
      const eastDateLine: LatLng = { lat: 0, lng: 180 };
      const westDateLine: LatLng = { lat: 0, lng: -180 };

      const mercatorEast = latLngToWebMercator(eastDateLine);
      const mercatorWest = latLngToWebMercator(westDateLine);

      // Should be at opposite sides
      expect(Math.abs(mercatorEast.x)).toBeCloseTo(Math.abs(mercatorWest.x), 1);
    });
  });

  describe('bearing', () => {
    it('should calculate bearing due north', () => {
      const start: LatLng = { lat: 0, lng: 0 };
      const end: LatLng = { lat: 1, lng: 0 };

      const result = bearing(start, end);

      expect(result).toBeCloseTo(0, 1);
    });

    it('should calculate bearing due east', () => {
      const start: LatLng = { lat: 0, lng: 0 };
      const end: LatLng = { lat: 0, lng: 1 };

      const result = bearing(start, end);

      expect(result).toBeCloseTo(90, 1);
    });

    it('should calculate bearing due south', () => {
      const start: LatLng = { lat: 0, lng: 0 };
      const end: LatLng = { lat: -1, lng: 0 };

      const result = bearing(start, end);

      expect(result).toBeCloseTo(180, 1);
    });

    it('should calculate bearing due west', () => {
      const start: LatLng = { lat: 0, lng: 0 };
      const end: LatLng = { lat: 0, lng: -1 };

      const result = bearing(start, end);

      expect(result).toBeCloseTo(270, 1);
    });
  });

  describe('destination', () => {
    it('should calculate destination north', () => {
      const start: LatLng = { lat: 0, lng: 0 };

      // Go 111 km north (approximately 1 degree)
      const result = destination(start, 0, 111);

      expect(result.lat).toBeCloseTo(1, 0);
      expect(result.lng).toBeCloseTo(0, 1);
    });

    it('should calculate destination east', () => {
      const start: LatLng = { lat: 0, lng: 0 };

      // Go 111 km east (approximately 1 degree at equator)
      const result = destination(start, 90, 111);

      expect(result.lat).toBeCloseTo(0, 1);
      expect(result.lng).toBeCloseTo(1, 0);
    });

    it('should be inverse of bearing and distance', () => {
      const start: LatLng = { lat: 40.7128, lng: -74.006 };
      const end: LatLng = { lat: 34.0522, lng: -118.2437 };

      const dist = haversineDistance(start, end);
      const bear = bearing(start, end);

      const calculated = destination(start, bear, dist);

      expect(calculated.lat).toBeCloseTo(end.lat, 1);
      expect(calculated.lng).toBeCloseTo(end.lng, 1);
    });
  });

  describe('isInBounds', () => {
    const bounds: LatLngBounds = {
      north: 50,
      south: 40,
      east: -120,
      west: -130,
    };

    it('should return true for point inside bounds', () => {
      const point: LatLng = { lat: 45, lng: -125 };

      expect(isInBounds(point, bounds)).toBe(true);
    });

    it('should return false for point outside bounds (north)', () => {
      const point: LatLng = { lat: 51, lng: -125 };

      expect(isInBounds(point, bounds)).toBe(false);
    });

    it('should return false for point outside bounds (south)', () => {
      const point: LatLng = { lat: 39, lng: -125 };

      expect(isInBounds(point, bounds)).toBe(false);
    });

    it('should return false for point outside bounds (east)', () => {
      const point: LatLng = { lat: 45, lng: -119 };

      expect(isInBounds(point, bounds)).toBe(false);
    });

    it('should return false for point outside bounds (west)', () => {
      const point: LatLng = { lat: 45, lng: -131 };

      expect(isInBounds(point, bounds)).toBe(false);
    });

    it('should return true for point on boundary', () => {
      const point: LatLng = { lat: 50, lng: -120 };

      expect(isInBounds(point, bounds)).toBe(true);
    });
  });
});
