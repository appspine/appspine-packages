import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

/**
 * Checks whether `grantedScopes` (an API key's scopes, or an MCP call context's scopes) satisfy
 * `requiredScope`. Shared between this guard and `@appspine/mcp-server`'s tool registry, which
 * has the same `module:action` scope shape and the same "*" wildcard convention.
 */
export function matchScope(grantedScopes: string[], requiredScope: string): boolean {
  if (grantedScopes.includes('*')) return true;
  const [reqModule, reqAction] = requiredScope.split(':');
  return grantedScopes.some((g) => {
    if (g === '*') return true;
    const [gModule, gAction] = g.split(':');
    if (gModule !== reqModule) return false;
    return gAction === '*' || gAction === reqAction;
  });
}

@Injectable()
export class ScopeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    // Use Reflect.getMetadata directly to avoid injecting Reflector across package boundaries.
    // Handler metadata takes priority over class metadata (same as Reflector.getAllAndOverride).
    const required: string[] | undefined =
      Reflect.getMetadata(SCOPES_KEY, ctx.getHandler()) ??
      Reflect.getMetadata(SCOPES_KEY, ctx.getClass());

    // No @Scopes() decorator — allow all callers
    if (!required?.length) return true;

    const { user } = ctx.switchToHttp().getRequest<{
      user?: { isApiKey?: boolean; scopes?: string[] };
    }>();

    // JWT users are not scope-restricted
    if (!user?.isApiKey) return true;

    const granted = user.scopes ?? [];

    const allowed = required.every((req) => matchScope(granted, req));

    if (!allowed) throw new ForbiddenException('Insufficient API key scopes');
    return true;
  }
}
