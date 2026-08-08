/**
 * Deterministic pseudo-random number generator (mulberry32).
 * Used for reproducible simulation/probability outcomes.
 * Falls back to Math.random() behavior when no seed is provided.
 */

// Singleton — one PRNG per world instance
let globalPRNG: PRNG | null = null;

/**
 * mulberry32 — fast, deterministic 32-bit PRNG.
 */
export class PRNG {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? (Math.random() * 2147483647) | 0;
  }

  /** Returns a float in [0, 1) — same contract as Math.random() */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

export function getPRNG(seed?: number): PRNG {
  if (!globalPRNG) {
    globalPRNG = new PRNG(seed);
  }
  return globalPRNG;
}

export function resetPRNG(seed?: number): void {
  globalPRNG = new PRNG(seed);
}
