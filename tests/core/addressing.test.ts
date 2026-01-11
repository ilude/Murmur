import { describe, it, expect } from 'vitest';
import {
  latLngToAddress,
  addressToLatLng,
  formatAddress,
  parseAddress,
  getRegionBounds,
  getCellBounds,
  type MeshAddress,
  type AddressingConfig,
} from '@/core/addressing';

describe('addressing', () => {
  const config: AddressingConfig = {
    regionCount: 229,
    cellsPerRegion: 64,
    projection: 'webMercator',
  };

  describe('latLngToAddress', () => {
    it('should convert Seattle coordinates to address', () => {
      const address = latLngToAddress(47.6062, -122.3321, config);

      expect(address.octet1).toBeGreaterThan(0);
      expect(address.octet1).toBeLessThanOrEqual(255);
      expect(address.octet2).toBeGreaterThanOrEqual(0);
      expect(address.octet2).toBeLessThan(255);
      expect(address.octet3).toBeGreaterThan(0);
      expect(address.octet3).toBeLessThanOrEqual(4095);
    });

    it('should have consistent region and cell values', () => {
      const address = latLngToAddress(40.7128, -74.006, config);

      expect(address.regionY).toBe(address.octet1 - 1);
      expect(address.regionX).toBe(address.octet2);

      // Verify cell encoding
      const cellY = (address.octet3 >> 6) & 0x3f;
      const cellX = address.octet3 & 0x3f;

      expect(address.cellY).toBe(cellY);
      expect(address.cellX).toBe(cellX);
    });

    it('should handle equator coordinates', () => {
      const address = latLngToAddress(0, 0, config);

      expect(address.octet1).toBeGreaterThan(0);
      expect(address.octet2).toBeGreaterThanOrEqual(0);
      expect(address.octet3).toBeGreaterThan(0);
    });

    it('should clamp values at poles', () => {
      const northPole = latLngToAddress(90, 0, config);
      const southPole = latLngToAddress(-90, 0, config);

      // Should not throw and should produce valid addresses
      expect(northPole.octet1).toBeGreaterThan(0);
      expect(southPole.octet1).toBeGreaterThan(0);
    });
  });

  describe('addressToLatLng', () => {
    it('should convert address back to approximate location', () => {
      const original = { lat: 47.6062, lng: -122.3321 };
      const address = latLngToAddress(original.lat, original.lng, config);
      const restored = addressToLatLng(address, config);

      // Should be in same general area (within a cell)
      expect(Math.abs(restored.lat - original.lat)).toBeLessThan(1);
      expect(Math.abs(restored.lng - original.lng)).toBeLessThan(2);
    });

    it('should return center of cell', () => {
      const address: MeshAddress = {
        octet1: 100,
        octet2: 50,
        octet3: 1000,
        regionX: 50,
        regionY: 99,
        cellX: 1000 & 0x3f,
        cellY: (1000 >> 6) & 0x3f,
      };

      const latLng = addressToLatLng(address, config);

      // Should produce valid coordinates
      expect(latLng.lat).toBeGreaterThanOrEqual(-90);
      expect(latLng.lat).toBeLessThanOrEqual(90);
      expect(latLng.lng).toBeGreaterThanOrEqual(-180);
      expect(latLng.lng).toBeLessThanOrEqual(180);
    });
  });

  describe('formatAddress / parseAddress', () => {
    it('should format address as string', () => {
      const address: MeshAddress = {
        octet1: 123,
        octet2: 45,
        octet3: 678,
        regionX: 45,
        regionY: 122,
        cellX: 38,
        cellY: 10,
      };

      const formatted = formatAddress(address);

      expect(formatted).toBe('123.45.678');
    });

    it('should parse address from string', () => {
      const parsed = parseAddress('123.45.678');

      expect(parsed).not.toBeNull();
      expect(parsed!.octet1).toBe(123);
      expect(parsed!.octet2).toBe(45);
      expect(parsed!.octet3).toBe(678);
    });

    it('should roundtrip format and parse', () => {
      const address: MeshAddress = {
        octet1: 200,
        octet2: 150,
        octet3: 3000,
        regionX: 150,
        regionY: 199,
        cellX: 3000 & 0x3f,
        cellY: (3000 >> 6) & 0x3f,
      };

      const formatted = formatAddress(address);
      const parsed = parseAddress(formatted);

      expect(parsed!.octet1).toBe(address.octet1);
      expect(parsed!.octet2).toBe(address.octet2);
      expect(parsed!.octet3).toBe(address.octet3);
    });

    it('should return null for invalid format', () => {
      expect(parseAddress('invalid')).toBeNull();
      expect(parseAddress('1.2')).toBeNull();
      expect(parseAddress('1.2.3.4')).toBeNull();
      expect(parseAddress('abc.def.ghi')).toBeNull();
    });

    it('should return null for out of range values', () => {
      expect(parseAddress('0.1.1')).toBeNull(); // octet1 must be >= 1
      expect(parseAddress('256.1.1')).toBeNull(); // octet1 must be <= 255
      expect(parseAddress('1.256.1')).toBeNull(); // octet2 must be <= 255
      expect(parseAddress('1.1.0')).toBeNull(); // octet3 must be >= 1
      expect(parseAddress('1.1.4096')).toBeNull(); // octet3 must be <= 4095
    });
  });

  describe('getRegionBounds', () => {
    it('should return valid bounds for region', () => {
      const bounds = getRegionBounds(50, 100, config);

      expect(bounds.north).toBeGreaterThan(bounds.south);
      expect(bounds.east).toBeGreaterThan(bounds.west);
      expect(bounds.north).toBeLessThanOrEqual(90);
      expect(bounds.south).toBeGreaterThanOrEqual(-90);
    });

    it('should have adjacent regions share boundaries', () => {
      const bounds1 = getRegionBounds(50, 100, config);
      const bounds2 = getRegionBounds(51, 100, config);

      // East edge of region 50 should be close to west edge of region 51
      expect(Math.abs(bounds1.east - bounds2.west)).toBeLessThan(0.1);
    });
  });

  describe('getCellBounds', () => {
    it('should return valid bounds for cell', () => {
      const address = latLngToAddress(47.6062, -122.3321, config);
      const bounds = getCellBounds(address, config);

      expect(bounds.north).toBeGreaterThan(bounds.south);
      expect(bounds.east).toBeGreaterThan(bounds.west);
      expect(bounds.north).toBeLessThanOrEqual(90);
      expect(bounds.south).toBeGreaterThanOrEqual(-90);
    });

    it('should contain the cell center point', () => {
      const address = latLngToAddress(47.6062, -122.3321, config);
      const bounds = getCellBounds(address, config);
      const center = addressToLatLng(address, config);

      expect(center.lat).toBeGreaterThanOrEqual(bounds.south);
      expect(center.lat).toBeLessThanOrEqual(bounds.north);
      expect(center.lng).toBeGreaterThanOrEqual(bounds.west);
      expect(center.lng).toBeLessThanOrEqual(bounds.east);
    });
  });

  describe('equirectangular projection', () => {
    const equiConfig: AddressingConfig = {
      ...config,
      projection: 'equirectangular',
    };

    it('should work with equirectangular projection', () => {
      const address = latLngToAddress(40.7128, -74.006, equiConfig);
      const restored = addressToLatLng(address, equiConfig);

      expect(Math.abs(restored.lat - 40.7128)).toBeLessThan(1);
      expect(Math.abs(restored.lng - -74.006)).toBeLessThan(2);
    });

    it('should produce different results than Web Mercator', () => {
      const webMercator = latLngToAddress(60, 10, config);
      const equirect = latLngToAddress(60, 10, equiConfig);

      // At high latitudes, projections differ significantly
      expect(webMercator.octet3).not.toBe(equirect.octet3);
    });
  });
});
