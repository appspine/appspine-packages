import { PermissionPolicy } from '@appspine/common';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SYSTEM_ADMIN_ROLE } from '../constants';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    // Use Reflect.getMetadata directly to avoid injecting Reflector across package boundaries.
    // Handler metadata takes priority over class metadata (same as Reflector.getAllAndOverride).
    const required: string[] | undefined =
      Reflect.getMetadata(PERMISSIONS_KEY, ctx.getHandler()) ??
      Reflect.getMetadata(PERMISSIONS_KEY, ctx.getClass());
    if (!required?.length) return true;

    const { user } = ctx.switchToHttp().getRequest<{
      user?: { roleNames?: string[]; permissionPolicy?: string; permissions?: string[] };
    }>();
    if (!user) throw new ForbiddenException();

    // 1. ADMIN always bypasses
    if (user.roleNames?.includes(SYSTEM_ADMIN_ROLE)) return true;

    // 2. ALLOW_ALL policy bypasses
    if (user.permissionPolicy === PermissionPolicy.ALLOW_ALL) return true;

    // 3. READ_ALL policy: auto-pass any *_READ permission
    if (
      user.permissionPolicy === PermissionPolicy.READ_ALL &&
      required.some((p) => p.endsWith('_READ'))
    ) {
      return true;
    }

    // 4. Explicit grant check (OR: any one of the required permissions suffices)
    if (required.some((p) => user.permissions?.includes(p))) return true;

    throw new ForbiddenException();
  }
}
