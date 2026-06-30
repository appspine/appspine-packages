import { Injectable } from '@nestjs/common';

const DEFAULT_LIMIT = 60;
const WINDOW_MS = 60_000;
const EVICTION_INTERVAL_MS = 5 * 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}

@Injectable()
export class ApiKeyRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor() {
    // Evict stale buckets every 5 minutes to prevent unbounded memory growth
    setInterval(() => this.evict(), EVICTION_INTERVAL_MS).unref();
  }

  check(keyId: string, limitPerMin: number | null): { allowed: boolean; retryAfter?: number } {
    const limit = limitPerMin ?? DEFAULT_LIMIT;
    const now = Date.now();
    let bucket = this.buckets.get(keyId);

    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      bucket = { count: 1, windowStart: now };
      this.buckets.set(keyId, bucket);
      return { allowed: true };
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000);
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  private evict(): void {
    const now = Date.now();
    for (const [id, bucket] of this.buckets) {
      if (now - bucket.windowStart >= WINDOW_MS * 2) {
        this.buckets.delete(id);
      }
    }
  }
}
