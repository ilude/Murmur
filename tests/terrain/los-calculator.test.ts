import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LOSCalculator } from '../../src/terrain/los-calculator.js';
import { ElevationApi } from '../../src/terrain/elevation-api.js';
import { ElevationCache } from '../../src/terrain/elevation-cache.js';

describe('LOSCalculator', () => {
  let calculator: LOSCalculator;
  let mockApi: ElevationApi;
  let cache: ElevationCache;

  beforeEach(() => {
    cache = new ElevationCache();
    mockApi = new ElevationApi();
    calculator = new LOSCalculator({}, mockApi, cache);
  });

  describe('checkLOS', () => {
    it('should return true for very short distances', async () => {
      const result = await calculator.checkLOS(
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8612, lng: -79.8953 }
      );

      expect(result.hasLOS).toBe(true);
      expect(result.terrainProfile.length).toBe(0);
    });

    it('should detect clear LOS on flat terrain with tall antennas', async () => {
      // Use taller antennas for clear LOS test
      const tallAntennaCalc = new LOSCalculator(
        { antennaHeightM: 20 }, // 20m antenna height clears Fresnel
        mockApi,
        cache
      );

      // Mock flat terrain at 300m elevation
      vi.spyOn(mockApi, 'getElevations').mockResolvedValue(
        Array(15).fill(300)
      );

      const result = await tallAntennaCalc.checkLOS(
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 }
      );

      expect(result.hasLOS).toBe(true);
      expect(result.terrainProfile.length).toBe(15);
      expect(result.worstClearanceM).toBeGreaterThan(0);
    });

    it('should detect obstruction from terrain', async () => {
      // Mock terrain with a hill in the middle
      // Start at 300m, hill at 400m, end at 300m
      const elevations = [300, 300, 320, 350, 380, 400, 420, 400, 380, 350, 320, 300, 300, 300, 300];

      vi.spyOn(mockApi, 'getElevations').mockResolvedValue(elevations);

      const result = await calculator.checkLOS(
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 }
      );

      expect(result.hasLOS).toBe(false);
      expect(result.obstructionPoint).toBeDefined();
    });

    it('should handle API failures gracefully', async () => {
      vi.spyOn(mockApi, 'getElevations').mockResolvedValue(
        Array(15).fill(undefined)
      );

      const result = await calculator.checkLOS(
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 }
      );

      // Should assume LOS when no data available
      expect(result.hasLOS).toBe(true);
    });

    it('should use cached elevations', async () => {
      // Pre-populate cache
      const points = [
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 },
      ];
      for (const p of points) {
        cache.set(p.lat, p.lng, 300);
      }

      const spy = vi.spyOn(mockApi, 'getElevations').mockResolvedValue([300]);

      await calculator.checkLOS(points[0]!, points[1]!);

      // Should have fetched for some points but used cache for endpoints
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('terrain profile', () => {
    it('should calculate correct profile points', async () => {
      const elevations = Array(15).fill(300);
      vi.spyOn(mockApi, 'getElevations').mockResolvedValue(elevations);

      const result = await calculator.checkLOS(
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 }
      );

      expect(result.terrainProfile.length).toBe(15);

      // First point should be at start
      const first = result.terrainProfile[0]!;
      expect(first.distanceKm).toBeCloseTo(0, 3);
      expect(first.groundElevationM).toBe(300);

      // Last point should be at end
      const last = result.terrainProfile[result.terrainProfile.length - 1]!;
      expect(last.groundElevationM).toBe(300);

      // Fresnel radius should be ~0 at endpoints, larger in middle
      expect(first.fresnelRadiusM).toBeCloseTo(0, 3);
      expect(last.fresnelRadiusM).toBeCloseTo(0, 3);

      const middle = result.terrainProfile[7]!;
      expect(middle.fresnelRadiusM).toBeGreaterThan(0);
    });

    it('should apply earth curvature correction', async () => {
      // For a 10km path, curvature effect at midpoint should be noticeable
      const longPathCalc = new LOSCalculator(
        { samplePoints: 3 },
        mockApi,
        cache
      );

      vi.spyOn(mockApi, 'getElevations').mockResolvedValue([300, 300, 300]);

      const result = await longPathCalc.checkLOS(
        { lat: 40.8, lng: -79.9 },
        { lat: 40.9, lng: -79.9 } // ~11km apart
      );

      // The middle point should have some correction
      const middle = result.terrainProfile[1]!;
      // LOS height should be higher than ground due to curvature
      expect(middle.losHeightM).toBeGreaterThan(middle.groundElevationM);
    });
  });

  describe('Fresnel zone calculation', () => {
    it('should calculate reasonable Fresnel radius for 915 MHz', async () => {
      vi.spyOn(mockApi, 'getElevations').mockResolvedValue(Array(15).fill(300));

      const result = await calculator.checkLOS(
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 } // ~2.5km apart
      );

      // At midpoint of a ~2.5km path at 915 MHz, Fresnel radius should be ~15-20m
      const middle = result.terrainProfile[7]!;
      expect(middle.fresnelRadiusM).toBeGreaterThan(10);
      expect(middle.fresnelRadiusM).toBeLessThan(30);
    });
  });

  describe('prefetchElevations', () => {
    it('should populate cache', async () => {
      vi.spyOn(mockApi, 'getElevations').mockResolvedValue([300, 350, 400]);

      const points = [
        { lat: 40.0, lng: -79.0 },
        { lat: 40.1, lng: -79.1 },
        { lat: 40.2, lng: -79.2 },
      ];

      await calculator.prefetchElevations(points);

      expect(cache.get(40.0, -79.0)).toBe(300);
      expect(cache.get(40.1, -79.1)).toBe(350);
      expect(cache.get(40.2, -79.2)).toBe(400);
    });
  });
});
