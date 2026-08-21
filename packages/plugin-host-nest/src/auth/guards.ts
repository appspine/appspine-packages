/**
 * Neutral authentication guards (PL1-11).
 *
 * A business controller states *what kind of caller* it accepts — a person, a machine, or either —
 * and the host resolves that through the registered strategies. It never names OIDC or API keys,
 * which is what lets `@appspine/rbac` and friends stop importing a provider package just to get a
 * guard class (PL0-04 section 2, "殘留具體依賴").
 *
 * Fail-closed in three places: no strategies registered is a 401 rather than an open door; a
 * strategy that recognises the credential and rejects it propagates its own error instead of
 * falling through to a weaker strategy; and exhausting every strategy is a 401.
 */

import type { Principal } from '@appspine/plugin-api';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrincipalContextService } from './principal-context';
import { AuthenticationStrategyRegistry, type AuthStrategyKind } from './strategy-registry';

@Injectable()
export class AppspineAuthGuard implements CanActivate {
  /** Strategy kinds this guard will try, in order. */
  protected readonly kinds: readonly AuthStrategyKind[] = ['interactive', 'machine'];

  // Explicit tokens: see the note in appspine-host.ts — no reliance on emitDecoratorMetadata.
  constructor(
    @Inject(AuthenticationStrategyRegistry)
    protected readonly registry: AuthenticationStrategyRegistry,
    @Inject(PrincipalContextService)
    protected readonly principalContext: PrincipalContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const strategies = this.kinds.flatMap((kind) => this.registry.list(kind));

    if (strategies.length === 0) {
      throw new UnauthorizedException(
        `No ${this.kinds.join('/')} authentication strategy is registered on this App`,
      );
    }

    for (const strategy of strategies) {
      const principal = await strategy.authenticate(context);
      if (principal) {
        this.attach(context, principal);
        return true;
      }
    }

    throw new UnauthorizedException();
  }

  private attach(context: ExecutionContext, principal: Principal): void {
    // `request.user` stays the source of truth so `@CurrentUser()` and every existing controller
    // that reads `req.user` behave exactly as they did before the host owned this.
    const request = context.switchToHttp().getRequest<{ user?: Principal }>();
    request.user = principal;
    this.principalContext.set(principal);
  }
}

/** Only a human login is accepted. Replaces provider-specific guards like `JwtAuthGuard`. */
@Injectable()
export class InteractiveAuthGuard extends AppspineAuthGuard {
  protected readonly kinds: readonly AuthStrategyKind[] = ['interactive'];

  // Explicit constructor: Nest does not read a parent's `design:paramtypes` for a subclass that
  // declares none, so inheriting the injection list silently yields an un-injectable guard.
  constructor(
    @Inject(AuthenticationStrategyRegistry) registry: AuthenticationStrategyRegistry,
    @Inject(PrincipalContextService) principalContext: PrincipalContextService,
  ) {
    super(registry, principalContext);
  }
}

/** Only a machine credential is accepted. */
@Injectable()
export class MachineAuthGuard extends AppspineAuthGuard {
  protected readonly kinds: readonly AuthStrategyKind[] = ['machine'];

  constructor(
    @Inject(AuthenticationStrategyRegistry) registry: AuthenticationStrategyRegistry,
    @Inject(PrincipalContextService) principalContext: PrincipalContextService,
  ) {
    super(registry, principalContext);
  }
}
