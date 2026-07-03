import { ForbiddenException } from '@nestjs/common';
import type { JwtUser } from './decorators/current-user.decorator';
import type { ApiKeyUser } from './user-context.util';

/// Resolve the effective acting user id for an identity-bound write.
/// JWT callers act as themselves; API-key callers act as their bound user.
/// Fail-closed: an API key with no bound acting user cannot perform the write.
export function resolveActingUserId(user: JwtUser | ApiKeyUser): string {
  if (!('isApiKey' in user) || !user.isApiKey) return user.sub; // JWT: sub is the User.id
  if (!user.actingUserId) {
    throw new ForbiddenException(
      'This API key has no acting user bound; cannot perform this write.',
    );
  }
  return user.actingUserId;
}
