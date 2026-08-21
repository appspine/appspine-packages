/**
 * Host-owned authentication strategy registry (PL1-11).
 *
 * 051 plan section 5.1: "host 提供 authentication strategy registry 與 principal context bridge;
 * OIDC、未來 local auth、API key 各自註冊 strategy，不讓業務 controller 組裝 JwtOrApiKeyGuard 類型的
 * provider-specific chain."
 *
 * The registry is what turns "which credential types does this App accept?" from something encoded
 * in every controller's `@UseGuards(...)` list into something the host knows and can report in the
 * catalog. Business plugins never inject a provider from here — they read the resolved principal.
 */

import type { Principal } from '@appspine/plugin-api';
import { type ExecutionContext, Injectable } from '@nestjs/common';

/**
 * `interactive` = a human logging in (OIDC today, a future local-auth); exactly one may be enabled
 * (051 decision 8). `machine` = a credential presented by a service (API keys); several may coexist.
 */
export type AuthStrategyKind = 'interactive' | 'machine';

export interface AuthenticationStrategy {
  /** Stable ID, used for ordering, diagnostics and the catalog. */
  id: string;
  kind: AuthStrategyKind;
  /**
   * Resolve the request's principal.
   *
   * Return `null` for "this request carries no credential of my type" — the guard then tries the
   * next strategy. Throw for "this request carries a credential of my type and it is invalid":
   * an expired token must produce 401, never a silent fall-through to a weaker strategy.
   */
  authenticate(context: ExecutionContext): Promise<Principal | null>;
}

export class DuplicateAuthStrategyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateAuthStrategyError';
  }
}

@Injectable()
export class AuthenticationStrategyRegistry {
  private readonly strategies = new Map<string, AuthenticationStrategy>();

  /**
   * Registers a strategy. Fails fast on a duplicate ID, and on a second interactive provider —
   * two login sources without an account-linking model is a security question, not a config
   * convenience (051 plan section 6.3).
   */
  register(strategy: AuthenticationStrategy): void {
    if (this.strategies.has(strategy.id)) {
      throw new DuplicateAuthStrategyError(
        `Authentication strategy "${strategy.id}" is already registered`,
      );
    }

    if (strategy.kind === 'interactive') {
      const existing = this.list('interactive');
      if (existing.length > 0) {
        throw new DuplicateAuthStrategyError(
          `Interactive authentication provider "${existing[0].id}" is already registered; "${strategy.id}" cannot also be enabled. ` +
            'Interactive providers are mutually exclusive in v1 (051 decision 8) — enabling both needs an account-linking plan, not a second registration.',
        );
      }
    }

    this.strategies.set(strategy.id, strategy);
  }

  /** Sorted by ID so authentication attempt order never depends on module import order. */
  list(kind?: AuthStrategyKind): AuthenticationStrategy[] {
    return [...this.strategies.values()]
      .filter((strategy) => kind === undefined || strategy.kind === kind)
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }

  get(id: string): AuthenticationStrategy | undefined {
    return this.strategies.get(id);
  }

  has(id: string): boolean {
    return this.strategies.has(id);
  }

  /** Catalog view: which credential types this App accepts. Never exposes strategy internals. */
  describe(): { id: string; kind: AuthStrategyKind }[] {
    return this.list().map((strategy) => ({ id: strategy.id, kind: strategy.kind }));
  }
}
