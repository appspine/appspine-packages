import { SYSTEM_ADMIN_ROLE } from '@appspine/plugin-api';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * The single implementation of "is this principal a system administrator".
 *
 * Three packages shipped their own copy after the 051 split (`identity-core`, `rbac`,
 * `m2m-api-key`), and the third had already drifted to a bare `'ADMIN'` literal with no shared
 * constant to compare against. Gate G1's independent review flagged it: an authorization rule with
 * three independent copies has no single place to change, and no way to notice when one lags.
 *
 * It lives in the host rather than in any capability package because it reads
 * `appspine.principal-context`'s neutral `roleNames` — the host contract every plugin already
 * depends on — so no capability has to import another one to authorize a request. Packages keep
 * exporting their own name for it (`AdminGuard`, `RbacAdminGuard`, `ApiKeyAdminGuard`) so no
 * consumer's `@UseGuards(...)` changes; they are aliases of this class, not copies of it.
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user?: { roleNames?: string[] } }>();
    if (!user?.roleNames?.includes(SYSTEM_ADMIN_ROLE)) throw new ForbiddenException();
    return true;
  }
}
