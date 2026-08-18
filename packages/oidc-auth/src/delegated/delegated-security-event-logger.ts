import { Injectable, Logger, type OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { DelegatedIdentityMappingError } from './delegated-identity-mapping.error';

const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_BUCKET = 20;

type RejectionCategory = 'identity_mapping_failed' | 'token_rejected' | 'internal_error';

type Bucket = {
  count: number;
  suppressed: number;
  windowStart: number;
};

@Injectable()
export class DelegatedSecurityEventLogger implements OnModuleDestroy {
  private readonly logger = new Logger(DelegatedSecurityEventLogger.name);
  private readonly buckets = new Map<string, Bucket>();
  private readonly flushTimer = setInterval(() => this.flushExpired(), WINDOW_MS).unref();

  recordRejection(profile: string, error: unknown): void {
    const category = categorize(error);
    const key = `${profile}:${category}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
      if (bucket?.suppressed) this.logSummary(profile, category, bucket.suppressed);
      bucket = { count: 0, suppressed: 0, windowStart: now };
      this.buckets.set(key, bucket);
    }

    if (bucket.count < MAX_EVENTS_PER_BUCKET) {
      bucket.count += 1;
      this.logger.warn(
        `[delegated-auth] ${JSON.stringify({ profile, category, outcome: 'rejected' })}`,
      );
      return;
    }
    bucket.suppressed += 1;
  }

  onModuleDestroy(): void {
    clearInterval(this.flushTimer);
    this.flushAll();
  }

  private flushExpired(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart < WINDOW_MS) continue;
      const separator = key.lastIndexOf(':');
      const profile = key.slice(0, separator);
      const category = key.slice(separator + 1) as RejectionCategory;
      if (bucket.suppressed) this.logSummary(profile, category, bucket.suppressed);
      this.buckets.delete(key);
    }
  }

  private flushAll(): void {
    for (const [key, bucket] of this.buckets) {
      const separator = key.lastIndexOf(':');
      const profile = key.slice(0, separator);
      const category = key.slice(separator + 1) as RejectionCategory;
      if (bucket.suppressed) this.logSummary(profile, category, bucket.suppressed);
    }
    this.buckets.clear();
  }

  private logSummary(profile: string, category: RejectionCategory, suppressed: number): void {
    this.logger.warn(
      `[delegated-auth] ${JSON.stringify({
        profile,
        category,
        outcome: 'rejected_suppressed_summary',
        suppressed,
      })}`,
    );
  }
}

function categorize(error: unknown): RejectionCategory {
  if (error instanceof DelegatedIdentityMappingError) return 'identity_mapping_failed';
  if (error instanceof UnauthorizedException) return 'token_rejected';
  return 'internal_error';
}
