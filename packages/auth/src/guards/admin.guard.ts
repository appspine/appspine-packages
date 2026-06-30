import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SYSTEM_ADMIN_ROLE } from '../constants';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const { user } = ctx.switchToHttp().getRequest<{ user?: { roleNames?: string[] } }>();
    if (!user?.roleNames?.includes(SYSTEM_ADMIN_ROLE)) throw new ForbiddenException();
    return true;
  }
}
