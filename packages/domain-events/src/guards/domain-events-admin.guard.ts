import {
  type Principal,
  SCOPE_MATCHER,
  type ScopeMatcherPort,
  SYSTEM_ADMIN_ROLE,
} from '@appspine/plugin-api';
import {
  type CanActivate,
  type CustomDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
} from '@nestjs/common';

export const DOMAIN_EVENTS_SCOPES_KEY = 'domain-events:scopes';

/**
 * Decorator to declare required API key scopes on domain-events admin endpoints.
 */
export const Scopes = (...scopes: string[]): CustomDecorator<string> =>
  SetMetadata(DOMAIN_EVENTS_SCOPES_KEY, scopes);

/**
 * Authorization guard for domain-events administration endpoints.
 *
 * Requirements:
 * - Interactive users (JWT / human logins) must hold the system administrator role (SYSTEM_ADMIN_ROLE or 'ADMIN').
 * - Machine users (API keys) must possess the declared required scopes (e.g. `domain-events:read`, `domain-events:write`, or wildcards).
 * - Decoupled from concrete `@appspine/auth` and `@appspine/m2m-api-key` packages by consuming
 *   `@appspine/plugin-host-nest`'s resolved principal and injecting `@appspine/plugin-api`'s `SCOPE_MATCHER` token.
 * - Strict Fail-Closed: if a machine credential is used but no scope matcher provider is registered,
 *   access is denied (403 Forbidden).
 */
@Injectable()
export class DomainEventsAdminGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(SCOPE_MATCHER)
    private readonly scopeMatcher?: ScopeMatcherPort,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?:
        | Principal
        | {
            sub?: string;
            roleNames?: string[];
            roles?: (string | { name: string })[];
            isApiKey?: boolean;
            kind?: string;
            scopes?: string[];
          };
    }>();

    const user = request.user;
    if (!user) {
      return false;
    }

    const isApiKey =
      'isApiKey' in user ? Boolean(user.isApiKey) : (user as { kind?: string }).kind === 'machine';

    if (!isApiKey) {
      // Interactive caller: must be an administrator.
      const roleNames: string[] = [];
      if ('roleNames' in user && Array.isArray(user.roleNames)) {
        roleNames.push(...user.roleNames);
      }
      if ('roles' in user && Array.isArray(user.roles)) {
        for (const role of user.roles) {
          if (typeof role === 'string') {
            roleNames.push(role);
          } else if (
            role &&
            typeof role === 'object' &&
            'name' in role &&
            typeof role.name === 'string'
          ) {
            roleNames.push(role.name);
          }
        }
      }

      const isAdmin =
        roleNames.includes(SYSTEM_ADMIN_ROLE) ||
        roleNames.includes('ADMIN') ||
        roleNames.includes('admin');

      if (!isAdmin) {
        throw new ForbiddenException('Admin access required');
      }

      return true;
    }

    // Machine caller: requires a scope matcher capability to validate scopes.
    if (!this.scopeMatcher) {
      throw new ForbiddenException(
        'No scope matcher provider is available to validate API key scopes',
      );
    }

    // Use Reflect.getMetadata to avoid injecting Reflector across package boundaries.
    const required: string[] | undefined =
      Reflect.getMetadata(DOMAIN_EVENTS_SCOPES_KEY, context.getHandler()) ??
      Reflect.getMetadata(DOMAIN_EVENTS_SCOPES_KEY, context.getClass());

    if (!required || required.length === 0) {
      throw new ForbiddenException(
        'This route declares no API key scopes; API key access is denied by default',
      );
    }

    const granted = 'scopes' in user && Array.isArray(user.scopes) ? (user.scopes as string[]) : [];

    const matcher = this.scopeMatcher;
    const allowed = required.every((req) => matcher.matches(granted, req));
    if (!allowed) {
      throw new ForbiddenException('Insufficient API key scopes');
    }

    return true;
  }
}
