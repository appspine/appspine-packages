/**
 * `appspine.principal-context` — the resolved request identity, available away from a controller
 * signature (PL1-11).
 *
 * Backed by `AsyncLocalStorage` rather than a request-scoped Nest provider on purpose: request
 * scope is contagious (every provider that injects a request-scoped one becomes request-scoped
 * too), which would quietly turn singletons across every capability plugin into per-request
 * instances. ALS keeps the providers singletons and still gives a service deep in a call chain the
 * current principal.
 *
 * Controllers should keep using `@CurrentUser()`; this exists for the code that has no parameter
 * to decorate — an audit helper, a Prisma middleware, a background-adjacent service.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Principal, PrincipalContextPort } from '@appspine/plugin-api';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

interface PrincipalStore {
  principal: Principal | null;
}

@Injectable()
export class PrincipalContextService implements PrincipalContextPort {
  private readonly storage = new AsyncLocalStorage<PrincipalStore>();

  /** Runs `work` with `principal` as the ambient identity. */
  run<T>(principal: Principal | null, work: () => T): T {
    return this.storage.run({ principal }, work);
  }

  /** Sets the principal on the store already entered for this request, if any. */
  set(principal: Principal | null): void {
    const store = this.storage.getStore();
    if (store) store.principal = principal;
  }

  current(): Principal | null {
    return this.storage.getStore()?.principal ?? null;
  }

  require(): Principal {
    const principal = this.current();
    if (!principal) {
      throw new UnauthorizedException('No authenticated principal on this request');
    }
    return principal;
  }
}

/**
 * Enters the ALS scope for the lifetime of a request.
 *
 * The `new Observable(...)` wrapper is not incidental: Nest subscribes to the observable returned
 * by `intercept()` *after* `intercept()` returns, so calling `storage.run(() => next.handle())`
 * directly would exit the scope before the handler ever ran. Subscribing inside the run callback
 * is what puts the handler — and every promise continuation it creates — inside the store.
 */
@Injectable()
export class PrincipalContextInterceptor implements NestInterceptor {
  constructor(
    @Inject(PrincipalContextService) private readonly principalContext: PrincipalContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: Principal } | undefined>();
    const principal = request?.user ?? null;

    return new Observable((subscriber) => {
      let teardown: { unsubscribe(): void } | undefined;
      this.principalContext.run(principal, () => {
        teardown = next.handle().subscribe(subscriber);
      });
      return () => teardown?.unsubscribe();
    });
  }
}
