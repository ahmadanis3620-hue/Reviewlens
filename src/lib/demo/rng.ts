/**
 * Seeded PRNG (mulberry32).
 *
 * The demo corpus must be byte-identical on every run so that tests can assert
 * against it and two people evaluating the product see the same thing.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick() on empty array");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Picks `count` distinct items, or all of them if count exceeds length. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
      const index = Math.floor(this.next() * pool.length);
      out.push(pool.splice(index, 1)[0] as T);
    }
    return out;
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}
