// Mirrors packages/m2m-api-key/src/api-key-rate-limiter.ts's bucket shape — kept as a
// separate copy rather than a shared dependency so this package stays zero-dependency
// (see 042-oidc-delegation-package-plan.md §7.1: no imports from other appspine packages).
const WINDOW_MS = 60_000;
const EVICTION_INTERVAL_MS = 5 * 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}

export class RollingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly evictionTimer: NodeJS.Timeout;

  constructor(private readonly limitPerMinute: number) {
    if (!Number.isInteger(limitPerMinute) || limitPerMinute <= 0) {
      throw new Error('limitPerMinute must be a positive integer');
    }
    this.evictionTimer = setInterval(() => this.evict(), EVICTION_INTERVAL_MS).unref();
  }

  /** Returns true if this key is still within its per-minute allowance. */
  tryConsume(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      bucket = { count: 1, windowStart: now };
      this.buckets.set(key, bucket);
      return bucket.count <= this.limitPerMinute;
    }

    bucket.count += 1;
    return bucket.count <= this.limitPerMinute;
  }

  dispose(): void {
    clearInterval(this.evictionTimer);
  }

  private evict(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= WINDOW_MS * 2) {
        this.buckets.delete(key);
      }
    }
  }
}
