import type { OidcDelegationLogEvent, OidcDelegationLogger } from './logger';
import { RollingWindowRateLimiter } from './rate-limiter';

// 042-oidc-delegation-package-plan.md §13/T-16630: bound security-rejection log volume so
// it can't be amplified into a log-flood DoS. Bucketed per error category; once a
// category's window is exhausted, further rejections only increment a suppressed counter,
// flushed as a single summary line per window.
const REJECTIONS_PER_MINUTE = 20;
const SUMMARY_FLUSH_INTERVAL_MS = 60_000;

export class SecurityEventLog {
  private readonly limiter = new RollingWindowRateLimiter(REJECTIONS_PER_MINUTE);
  private readonly suppressed = new Map<string, number>();
  private readonly flushTimer: NodeJS.Timeout;

  constructor(private readonly logger: OidcDelegationLogger) {
    this.flushTimer = setInterval(() => this.flushSuppressed(), SUMMARY_FLUSH_INTERVAL_MS).unref();
  }

  recordRejection(event: OidcDelegationLogEvent): void {
    if (this.limiter.tryConsume(event.category)) {
      this.logger.log(event);
      return;
    }
    this.suppressed.set(event.category, (this.suppressed.get(event.category) ?? 0) + 1);
  }

  dispose(): void {
    clearInterval(this.flushTimer);
  }

  private flushSuppressed(): void {
    for (const [category, count] of this.suppressed) {
      if (count > 0) {
        this.logger.log({
          provider: 'oidc-delegation',
          policy: 'n/a',
          category: `${category}_suppressed_summary`,
          latencyMs: 0,
          correlationId: `suppressed_count=${count}`,
        });
      }
    }
    this.suppressed.clear();
  }
}
