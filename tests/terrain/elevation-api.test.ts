import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElevationApi } from '../../src/terrain/elevation-api.js';

describe('ElevationApi', () => {
  let api: ElevationApi;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    api = new ElevationApi();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getElevations', () => {
    it('should return empty array for empty input', async () => {
      const result = await api.getElevations([]);
      expect(result).toEqual([]);
    });

    it('should fetch elevations from API', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elevation: [350, 400, 380] }),
      });

      const points = [
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 },
        { lat: 40.8480, lng: -79.8750 },
      ];

      const result = await api.getElevations(points);

      expect(result).toEqual([350, 400, 380]);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('latitude=40.861200,40.875000,40.848000'),
        expect.any(Object)
      );
    });

    it('should handle API errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const points = [{ lat: 40.8612, lng: -79.8953 }];
      const result = await api.getElevations(points);

      expect(result).toEqual([undefined]);
    });

    it('should handle network errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const points = [{ lat: 40.8612, lng: -79.8953 }];
      const result = await api.getElevations(points);

      expect(result).toEqual([undefined]);
    });

    it('should handle malformed response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ badData: true }),
      });

      const points = [{ lat: 40.8612, lng: -79.8953 }];
      const result = await api.getElevations(points);

      expect(result).toEqual([undefined]);
    });

    it('should batch requests when exceeding max batch size', async () => {
      const smallBatchApi = new ElevationApi({ maxBatchSize: 3 });

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ elevation: [100, 200, 300] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ elevation: [400, 500] }),
        });

      const points = [
        { lat: 40.0, lng: -79.0 },
        { lat: 40.1, lng: -79.1 },
        { lat: 40.2, lng: -79.2 },
        { lat: 40.3, lng: -79.3 },
        { lat: 40.4, lng: -79.4 },
      ];

      const result = await smallBatchApi.getElevations(points);

      expect(result).toEqual([100, 200, 300, 400, 500]);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getElevation', () => {
    it('should fetch single elevation', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elevation: [350] }),
      });

      const result = await api.getElevation({ lat: 40.8612, lng: -79.8953 });
      expect(result).toBe(350);
    });
  });

  describe('getElevationPoints', () => {
    it('should return points with elevations', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elevation: [350, 400] }),
      });

      const points = [
        { lat: 40.8612, lng: -79.8953 },
        { lat: 40.8750, lng: -79.9150 },
      ];

      const result = await api.getElevationPoints(points);

      expect(result).toEqual([
        { lat: 40.8612, lng: -79.8953, elevation: 350 },
        { lat: 40.8750, lng: -79.9150, elevation: 400 },
      ]);
    });
  });
});
