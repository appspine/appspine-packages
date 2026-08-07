import { describe, expect, it, vi } from 'vitest';
import { SecurityEventLog } from './security-event-log';

describe('SecurityEventLog', () => {
  it('logs rejections up to the per-category rate limit', () => {
    const log = vi.fn();
    const securityLog = new SecurityEventLog({ log });

    for (let i = 0; i < 20; i++) {
      securityLog.recordRejection({
        provider: 'keycloak',
        policy: 'submit',
        category: 'exchange_denied',
        latencyMs: 1,
      });
    }
    expect(log).toHaveBeenCalledTimes(20);

    securityLog.dispose();
  });

  it('suppresses events beyond the rate limit instead of logging every one (anti log-flood)', () => {
    const log = vi.fn();
    const securityLog = new SecurityEventLog({ log });

    for (let i = 0; i < 100; i++) {
      securityLog.recordRejection({
        provider: 'keycloak',
        policy: 'submit',
        category: 'exchange_denied',
        latencyMs: 1,
      });
    }
    // Only the first 20 within the window are logged individually — the rest are suppressed.
    expect(log).toHaveBeenCalledTimes(20);

    securityLog.dispose();
    expect(log).toHaveBeenCalledTimes(21);
    expect(log.mock.calls.at(-1)?.[0]).toMatchObject({
      category: 'exchange_denied_suppressed_summary',
      correlationId: 'suppressed_count=80',
    });
  });

  it('buckets rate limiting independently per category', () => {
    const log = vi.fn();
    const securityLog = new SecurityEventLog({ log });

    for (let i = 0; i < 20; i++) {
      securityLog.recordRejection({
        provider: 'keycloak',
        policy: 'submit',
        category: 'exchange_denied',
        latencyMs: 1,
      });
    }
    // A different category still has its own untouched allowance.
    securityLog.recordRejection({
      provider: 'keycloak',
      policy: 'submit',
      category: 'invalid_subject_token',
      latencyMs: 1,
    });
    expect(log).toHaveBeenCalledTimes(21);

    securityLog.dispose();
  });
});
