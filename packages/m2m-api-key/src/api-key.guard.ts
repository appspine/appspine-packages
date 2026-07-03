import { createHash } from 'node:crypto';
import { type ApiKeyUser, buildUserContext } from '@appspine/auth';
import { PrismaService } from '@appspine/common';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ApiKeyRateLimiter } from './api-key-rate-limiter';
import { KEY_PREFIX } from './api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: ApiKeyRateLimiter,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: ApiKeyUser;
    }>();

    const rawKey = request.headers['x-api-key'];
    // Express may return string | string[] for duplicate headers; reject anything
    // that isn't a single, well-formed key before hashing.
    if (typeof rawKey !== 'string' || !rawKey.startsWith(KEY_PREFIX)) return false;

    const hashedKey = createHash('sha256').update(rawKey).digest('hex');
    const now = new Date();

    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        hashedKey,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        role: { include: { permissions: true } },
        actingUser: { select: { id: true, isActive: true } },
      },
    });

    if (!apiKey) return false;

    const { allowed, retryAfter } = this.rateLimiter.check(apiKey.id, apiKey.rateLimit);
    if (!allowed) {
      const response = ctx
        .switchToHttp()
        .getResponse<{ setHeader: (n: string, v: string) => void }>();
      response.setHeader('Retry-After', String(retryAfter ?? 60));
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Fire-and-forget lastUsedAt update
    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: now } })
      .catch((e: unknown) => console.error('[ApiKeyGuard] lastUsedAt update failed:', e));

    const actingUserId = apiKey.actingUser?.isActive ? apiKey.actingUser.id : null;

    request.user = {
      sub: apiKey.id,
      ...buildUserContext([apiKey.role]),
      scopes: apiKey.scopes,
      isApiKey: true,
      actingUserId,
    };

    return true;
  }
}
