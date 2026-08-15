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

    const { user } = ctx.switchToHttp().getRequest<{
      user?: { isApiKey?: boolean; scopes?: string[] };
    }>();

    // JWT users are not scope-restricted — scopes are an API-key-only mechanism, and a JWT
    // principal's authorization is decided by AdminGuard/PermissionGuard instead.
    if (!user?.isApiKey) return true;

    // FAIL CLOSED for API-key principals: no @Scopes() reachable on the handler *or* the
    // controller class means the route never declared what an API key is allowed to do
    // there. Previously this returned true, so adding a handler to a ScopeGuard-protected
    // controller without a @Scopes() decorator silently granted every API key full access to
    // it. An intentionally scope-free M2M route must now say so explicitly with
    // `@Scopes('*')`.
    if (!required?.length) {
      throw new ForbiddenException(
        'This route declares no API key scopes; API key access is denied by default',
      );
    }

    const granted = user.scopes ?? [];

    const allowed = required.every((req) => matchScope(granted, req));

    if (!allowed) throw new ForbiddenException('Insufficient API key scopes');
    return true;
  }
}
