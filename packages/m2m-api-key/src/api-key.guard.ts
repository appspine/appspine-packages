import { createHash } from 'node:crypto';
import { PrismaService } from '@appspine/common';
import { RBAC_POLICY, type RbacPolicyPort } from '@appspine/plugin-api';
import type { ApiKeyUser } from '@appspine/plugin-host-nest';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ApiKeyRateLimiter } from './api-key-rate-limiter';
import { KEY_PREFIX } from './api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  /**
   * `RBAC_POLICY` is optional at injection and mandatory at use.
   *
   * Before the 051 split this guard called `buildUserContext()`, a pure function from
   * `@appspine/auth`, so it had no DI requirement at all. Requiring the token outright would turn
   * "this App has not installed RBAC" into a boot failure for the whole application — in a package
   * that has no manifest yet (it migrates in Phase 4), so nothing could have warned the operator
   * first. Gate G1's independent review found exactly that, shipped as a patch.
   *
   * Fail-closed instead: without a policy provider an API key authorises nothing, and says so.
   * The App boots, every other authentication path keeps working, and no request is ever served
   * with a silently permission-less principal.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: ApiKeyRateLimiter,
    @Optional() @Inject(RBAC_POLICY) private readonly rbacPolicy?: RbacPolicyPort,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: ApiKeyUser;
    }>();

    if (!this.rbacPolicy) {
      // Logged per rejected request on purpose: a misconfiguration that disables API-key auth
      // should be noisy in the logs of the requests it actually breaks, not once at boot where it
      // scrolls past.
      this.logger.error(
        'API key authentication is unavailable: no appspine.rbac-policy provider is registered. ' +
          'Import RbacModule (or another provider of RBAC_POLICY) to enable it.',
      );
      return false;
    }

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
      .catch((e: unknown) => this.logger.error(`lastUsedAt update failed: ${errorMessage(e)}`));

    const actingUserId = apiKey.actingUser?.isActive ? apiKey.actingUser.id : null;

    request.user = {
      sub: apiKey.id,
      ...this.rbacPolicy.flatten([apiKey.role]),
      scopes: apiKey.scopes,
      isApiKey: true,
      actingUserId,
    };

    return true;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
