import { OidcDelegationError } from '../errors';
import { RollingWindowRateLimiter } from './rate-limiter';

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * Bounds outbound calls to the token endpoint: a per-policy rate limit plus a simple
 * consecutive-failure circuit breaker. See 042-oidc-delegation-package-plan.md §8 — a
 * business-layer retry loop (or an attacker) must not be able to hammer the IdP's token
 * endpoint hard enough to trip its own brute-force protection and lock out normal login.
 */
export class OutboundThrottle {
  private readonly limiter: RollingWindowRateLimiter;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(
    maxExchangesPerMinutePerPolicy: number,
    private readonly failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    private readonly cooldownMs = DEFAULT_COOLDOWN_MS,
  ) {
    this.limiter = new RollingWindowRateLimiter(maxExchangesPerMinutePerPolicy);
  }

  /** Throws provider_unavailable if the circuit is open or the rate limit is exceeded. */
  checkAndConsume(policyName: string): void {
    if (Date.now() < this.circuitOpenUntil) {
      throw new OidcDelegationError(
        'provider_unavailable',
        'exchange temporarily suspended after repeated provider failures',
      );
    }
    if (!this.limiter.tryConsume(policyName)) {
      throw new OidcDelegationError(
        'provider_unavailable',
        'outbound exchange rate limit exceeded',
      );
    }
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  recordProviderFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitOpenUntil = Date.now() + this.cooldownMs;
    }
  }

  dispose(): void {
    this.limiter.dispose();
  }
}
