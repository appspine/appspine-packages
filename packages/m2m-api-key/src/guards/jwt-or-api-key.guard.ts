import { InteractiveAuthGuard } from '@appspine/plugin-host-nest';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiKeyGuard } from '../api-key.guard';

/**
 * Accepts either an API key or an interactive login.
 *
 * The interactive half no longer names OIDC: it goes through the host's strategy registry
 * (051 PL1-11), so an App that swaps its login provider does not have to touch this guard. The
 * ordering is unchanged — API key first, because `ApiKeyGuard` returning `false` means "no
 * X-Api-Key header", not "bad key".
 *
 * `@appspine/plugin-host-nest`'s `AppspineAuthGuard` covers the same ground generically; this
 * class stays because it is public API of this package and existing controllers reference it.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyGuard: ApiKeyGuard,
    private readonly interactiveGuard: InteractiveAuthGuard,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // API key takes priority; false means "no X-Api-Key header", not an error
    const apiKeyPassed = await this.apiKeyGuard.canActivate(ctx);
    if (apiKeyPassed) return true;

    return this.interactiveGuard.canActivate(ctx) as Promise<boolean>;
  }
}
