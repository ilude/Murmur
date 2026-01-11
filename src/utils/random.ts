/**
 * Seeded pseudo-random number generator for deterministic simulation replay
 * Uses a simple LCG (Linear Congruential Generator) implementation
 */

export interface SeededRandom {
  readonly seed: number;
  next(): number;
  nextInt(min: number, max: number): number;
  nextGaussian(mean: number, stdDev: number): number;
  nextChoice<T>(array: T[]): T;
  shuffle<T>(array: T[]): T[];
  fork(): SeededRandom;
  reset(): void;
}

class SeededRandomImpl implements SeededRandom {
  private state: number;
  private readonly initialSeed: number;

  // LCG parameters (from Numerical Recipes)
  private readonly a = 1664525;
  private readonly c = 1013904223;
  private readonly m = 2 ** 32;

  constructor(seed: number) {
    this.initialSeed = seed;
    this.state = seed;
  }

  get seed(): number {
    return this.initialSeed;
  }

  /**
   * Generate next random number in range [0, 1)
   */
  next(): number {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state / this.m;
  }

  /**
   * Generate random integer in range [min, max] (inclusive)
   */
  nextInt(min: number, max: number): number {
    if (min > max) {
      throw new Error('min must be <= max');
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generate random number from Gaussian (normal) distribution
   * Uses Box-Muller transform
   */
  nextGaussian(mean: number, stdDev: number): number {
    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();

    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    return mean + z0 * stdDev;
  }

  /**
   * Pick a random element from an array
   */
  nextChoice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    const index = this.nextInt(0, array.length - 1);
    return array[index]!;
  }

  /**
   * Shuffle an array in place using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }

  /**
   * Create a new SeededRandom with a derived seed
   */
  fork(): SeededRandom {
    const newSeed = this.nextInt(0, 2 ** 31 - 1);
    return new SeededRandomImpl(newSeed);
  }

  /**
   * Reset to initial seed state
   */
  reset(): void {
    this.state = this.initialSeed;
  }
}

/**
 * Create a new seeded random number generator
 */
export function createSeededRandom(seed: number): SeededRandom {
  return new SeededRandomImpl(seed);
}
