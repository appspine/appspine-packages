import { type Principal, SCOPE_MATCHER, type ScopeMatcherPort } from '@appspine/plugin-api';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

/**
 * Authorization guard for metadata schema access.
 *
 * Requirements:
 * - Interactive users (human logins / JWT) have full access to schema introspection.
 * - Machine users (API keys) must possess the `metadata:read` scope (or a wildcard like `metadata:*` or `*`).
 * - Decoupled from concrete `@appspine/m2m-api-key` implementations via the neutral `SCOPE_MATCHER` token.
 * - Strict Fail-Closed: if a machine credential is presented but no scope matcher capability
 *   is registered, access is denied (403 Forbidden).
 */
@Injectable()
export class MetadataScopeGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(SCOPE_MATCHER)
    private readonly scopeMatcher?: ScopeMatcherPort,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: Principal | { isApiKey?: boolean; scopes?: string[] };
    }>();
    const user = request.user;

    if (!user) {
      return false;
    }

    const isApiKey =
      'isApiKey' in user ? Boolean(user.isApiKey) : (user as { kind?: string }).kind === 'machine';

    // Interactive principals are not scope-restricted.
    if (!isApiKey) {
      return true;
    }

    // Machine caller: require a scope matcher port to validate scopes.
    if (!this.scopeMatcher) {
      throw new ForbiddenException(
        'No scope matcher provider is available to validate API key scopes',
      );
    }

    const scopes = 'scopes' in user && Array.isArray(user.scopes) ? (user.scopes as string[]) : [];

    const allowed = this.scopeMatcher.matches(scopes, 'metadata:read');
    if (!allowed) {
      throw new ForbiddenException('Insufficient API key scopes');
    }

    return true;
  }
}
