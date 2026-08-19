import { InteractiveAuthGuard } from '@appspine/plugin-host-nest';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiKeyGuard } from '../api-key.guard';

/**
 * Accepts either an API key or an interactive login.
 *
 * @deprecated 051 PL4-03: Use `@appspine/plugin-host-nest`'s `AppspineAuthGuard` for neutral cross-plugin
 * authentication instead. This guard is retained for backward compatibility with legacy controllers.
 *
 * The interactive half goes through the host's strategy registry (051 PL1-11), so an App that swaps
 * its login provider does not have to touch this guard. The ordering is unchanged — API key first,
 * because `ApiKeyGuard` returning `false` means "no X-Api-Key header", not "bad key".
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
