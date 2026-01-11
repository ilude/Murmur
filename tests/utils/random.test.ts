import { describe, it, expect } from 'vitest';
import { createSeededRandom } from '@/utils/random';

describe('SeededRandom', () => {
  describe('determinism', () => {
    it('should generate same sequence with same seed', () => {
      const rng1 = createSeededRandom(12345);
      const rng2 = createSeededRandom(12345);

      const sequence1 = Array.from({ length: 10 }, () => rng1.next());
      const sequence2 = Array.from({ length: 10 }, () => rng2.next());

      expect(sequence1).toEqual(sequence2);
    });

    it('should generate different sequences with different seeds', () => {
      const rng1 = createSeededRandom(12345);
      const rng2 = createSeededRandom(54321);

      const sequence1 = Array.from({ length: 10 }, () => rng1.next());
      const sequence2 = Array.from({ length: 10 }, () => rng2.next());

      expect(sequence1).not.toEqual(sequence2);
    });

    it('should restore sequence after reset', () => {
      const rng = createSeededRandom(12345);

      const sequence1 = Array.from({ length: 10 }, () => rng.next());

      rng.reset();

      const sequence2 = Array.from({ length: 10 }, () => rng.next());

      expect(sequence1).toEqual(sequence2);
    });
  });

  describe('next', () => {
    it('should generate values in range [0, 1)', () => {
      const rng = createSeededRandom(12345);

      for (let i = 0; i < 1000; i++) {
        const value = rng.next();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should generate approximately uniform distribution', () => {
      const rng = createSeededRandom(12345);
      const bins = Array(10).fill(0);

      for (let i = 0; i < 10000; i++) {
        const value = rng.next();
        const bin = Math.floor(value * 10);
        bins[bin]++;
      }

      // Each bin should have approximately 1000 values (±20%)
      for (const count of bins) {
        expect(count).toBeGreaterThan(800);
        expect(count).toBeLessThan(1200);
      }
    });
  });

  describe('nextInt', () => {
    it('should generate integers in specified range', () => {
      const rng = createSeededRandom(12345);

      for (let i = 0; i < 100; i++) {
        const value = rng.nextInt(5, 15);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(15);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should handle single value range', () => {
      const rng = createSeededRandom(12345);

      for (let i = 0; i < 10; i++) {
        const value = rng.nextInt(42, 42);
        expect(value).toBe(42);
      }
    });

    it('should throw error if min > max', () => {
      const rng = createSeededRandom(12345);

      expect(() => rng.nextInt(10, 5)).toThrow();
    });

    it('should generate approximately uniform distribution', () => {
      const rng = createSeededRandom(12345);
      const counts = new Map<number, number>();

      for (let i = 0; i < 10000; i++) {
        const value = rng.nextInt(0, 9);
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }

      // Each value should appear approximately 1000 times (±20%)
      for (let i = 0; i < 10; i++) {
        const count = counts.get(i) ?? 0;
        expect(count).toBeGreaterThan(800);
        expect(count).toBeLessThan(1200);
      }
    });
  });

  describe('nextGaussian', () => {
    it('should generate values centered around mean', () => {
      const rng = createSeededRandom(12345);
      const values: number[] = [];

      for (let i = 0; i < 1000; i++) {
        values.push(rng.nextGaussian(50, 10));
      }

      const mean = values.reduce((a, b) => a + b, 0) / values.length;

      // Mean should be approximately 50 (±5%)
      expect(mean).toBeGreaterThan(47.5);
      expect(mean).toBeLessThan(52.5);
    });

    it('should respect standard deviation', () => {
      const rng = createSeededRandom(12345);
      const values: number[] = [];

      for (let i = 0; i < 1000; i++) {
        values.push(rng.nextGaussian(0, 5));
      }

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        values.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation should be approximately 5 (±20%)
      expect(stdDev).toBeGreaterThan(4);
      expect(stdDev).toBeLessThan(6);
    });
  });

  describe('nextChoice', () => {
    it('should pick element from array', () => {
      const rng = createSeededRandom(12345);
      const array = ['a', 'b', 'c', 'd', 'e'];

      for (let i = 0; i < 100; i++) {
        const choice = rng.nextChoice(array);
        expect(array).toContain(choice);
      }
    });

    it('should throw error for empty array', () => {
      const rng = createSeededRandom(12345);

      expect(() => rng.nextChoice([])).toThrow();
    });

    it('should pick all elements with approximately equal probability', () => {
      const rng = createSeededRandom(12345);
      const array = ['a', 'b', 'c', 'd', 'e'];
      const counts = new Map<string, number>();

      for (let i = 0; i < 5000; i++) {
        const choice = rng.nextChoice(array);
        counts.set(choice, (counts.get(choice) ?? 0) + 1);
      }

      // Each element should be picked approximately 1000 times (±20%)
      for (const element of array) {
        const count = counts.get(element) ?? 0;
        expect(count).toBeGreaterThan(800);
        expect(count).toBeLessThan(1200);
      }
    });
  });

  describe('shuffle', () => {
    it('should return array with same elements', () => {
      const rng = createSeededRandom(12345);
      const array = [1, 2, 3, 4, 5];

      const shuffled = rng.shuffle(array);

      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should not modify original array', () => {
      const rng = createSeededRandom(12345);
      const array = [1, 2, 3, 4, 5];
      const original = [...array];

      rng.shuffle(array);

      expect(array).toEqual(original);
    });

    it('should generate different permutations', () => {
      const rng = createSeededRandom(12345);
      const array = [1, 2, 3, 4, 5];

      const shuffled1 = rng.shuffle(array);
      const shuffled2 = rng.shuffle(array);

      // Very unlikely to get same permutation twice
      expect(shuffled1).not.toEqual(shuffled2);
    });

    it('should be deterministic with same seed', () => {
      const rng1 = createSeededRandom(12345);
      const rng2 = createSeededRandom(12345);
      const array = [1, 2, 3, 4, 5];

      const shuffled1 = rng1.shuffle(array);
      const shuffled2 = rng2.shuffle(array);

      expect(shuffled1).toEqual(shuffled2);
    });
  });

  describe('fork', () => {
    it('should create independent RNG', () => {
      const rng1 = createSeededRandom(12345);
      const rng2 = rng1.fork();

      const sequence1 = Array.from({ length: 10 }, () => rng1.next());
      const sequence2 = Array.from({ length: 10 }, () => rng2.next());

      expect(sequence1).not.toEqual(sequence2);
    });

    it('should not affect parent RNG', () => {
      const rng1 = createSeededRandom(12345);
      const rng2 = rng1.fork();

      // Generate some numbers from forked RNG
      for (let i = 0; i < 10; i++) {
        rng2.next();
      }

      // Parent should still generate expected sequence
      const expected = createSeededRandom(12345);
      expected.fork(); // Advance to same state

      expect(rng1.next()).toBe(expected.next());
    });

    it('should create deterministic fork', () => {
      const rng1 = createSeededRandom(12345);
      const rng2 = createSeededRandom(12345);

      const fork1 = rng1.fork();
      const fork2 = rng2.fork();

      expect(fork1.next()).toBe(fork2.next());
    });
  });
});
