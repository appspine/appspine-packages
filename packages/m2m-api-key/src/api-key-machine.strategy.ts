import { createHash } from 'node:crypto';
import { PrismaService } from '@appspine/common';
import { type MachinePrincipal, RBAC_POLICY, type RbacPolicyPort } from '@appspine/plugin-api';
import type { AuthenticationStrategy } from '@appspine/plugin-host-nest';
import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyRateLimiter } from './api-key-rate-limiter';
import { KEY_PREFIX } from './api-keys.service';

/**
 * Registers API keys as a machine authentication provider with the host strategy registry (051 PL4-03, PL1-11).
 *
 * Implements the neutral `AuthenticationStrategy` contract:
 *  - Returns `null` when no `X-Api-Key` header is present (allows fall-through to interactive or other machine strategies).
 *  - Throws `UnauthorizedException` when an API key is presented but invalid, expired, inactive, or malformed.
 *  - Throws `HttpException(429)` with `Retry-After` header when rate limit is exceeded.
 *  - Fails closed with `UnauthorizedException` if no `RBAC_POLICY` provider is available.
 */
@Injectable()
export class ApiKeyMachineStrategy implements AuthenticationStrategy {
  readonly id = 'api-key';
  readonly kind = 'machine' as const;

  private readonly logger = new Logger(ApiKeyMachineStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: ApiKeyRateLimiter,
    @Optional() @Inject(RBAC_POLICY) private readonly rbacPolicy?: RbacPolicyPort,
  ) {}

  async authenticate(context: ExecutionContext): Promise<MachinePrincipal | null> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const rawKey = request?.headers?.['x-api-key'];
    // No header presented -> fall through to next strategy
    if (typeof rawKey !== 'string') return null;

    // Header presented but malformed -> reject explicitly
    if (!rawKey.startsWith(KEY_PREFIX)) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!this.rbacPolicy) {
      this.logger.error(
        'API key authentication is unavailable: no appspine.rbac-policy provider is registered. ' +
          'Import RbacModule (or another provider of RBAC_POLICY) to enable it.',
      );
      throw new UnauthorizedException(
        'API key authentication is unavailable: no RBAC policy provider registered',
      );
    }

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

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const { allowed, retryAfter } = this.rateLimiter.check(apiKey.id, apiKey.rateLimit);
    if (!allowed) {
      const response = context
        .switchToHttp()
        .getResponse<{ setHeader?: (name: string, value: string) => void }>();
      if (typeof response?.setHeader === 'function') {
        response.setHeader('Retry-After', String(retryAfter ?? 60));
      }
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Fire-and-forget lastUsedAt update
    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: now } })
      .catch((e: unknown) => this.logger.error(`lastUsedAt update failed: ${errorMessage(e)}`));

    const actingUserId = apiKey.actingUser?.isActive ? apiKey.actingUser.id : null;
    const flattened = this.rbacPolicy.flatten([apiKey.role]);

    return {
      sub: apiKey.id,
      ...flattened,
      scopes: apiKey.scopes,
      isApiKey: true,
      actingUserId,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
