import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DELEGATED_PROFILE_KEY } from './decorators/delegated-profile.decorator';
import { DELEGATED_AUTH_PROFILES } from './delegated-auth.constants';
import { DelegatedJwtVerifierService } from './delegated-jwt-verifier.service';
import { DelegatedPrincipalMapperService } from './delegated-principal-mapper.service';
import { DelegatedSecurityEventLogger } from './delegated-security-event-logger';
import type { DelegationContext, ResolvedDelegatedOidcTrustProfile } from './types';

type DelegatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
  delegationContext?: DelegationContext;
};

/**
 * Endpoint-scoped Guard for delegated (Token Exchange) tokens. Deliberately independent of
 * `JwtOrApiKeyGuard`'s OR-chain (`@appspine/m2m-api-key`) — this must be an AND-composed
 * guard that only ever activates on a handler explicitly carrying `@DelegatedProfile()`, so
 * an endpoint that forgets the decorator cannot accidentally accept a delegated token via
 * some other guard's fallback path. See 042-oidc-delegation-package-plan.md §7.4 / §9.
 */
@Injectable()
export class DelegatedAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: DelegatedJwtVerifierService,
    private readonly mapper: DelegatedPrincipalMapperService,
    private readonly securityEventLogger: DelegatedSecurityEventLogger,
    @Inject(DELEGATED_AUTH_PROFILES)
    private readonly profiles: Readonly<Record<string, ResolvedDelegatedOidcTrustProfile>>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const profileName = this.reflector.get<string | undefined>(
      DELEGATED_PROFILE_KEY,
      ctx.getHandler(),
    );
    if (!profileName) {
      // No @DelegatedProfile() on this handler: never authenticate a delegated token here.
      throw new UnauthorizedException();
    }

    const profile = this.profiles[profileName];
    if (!profile) {
      // Boot-time validation (validateDelegatedProfiles) should make this unreachable —
      // fail loudly rather than silently deny or silently accept.
      throw new Error(`Delegated profile "${profileName}" is not configured`);
    }

    const request = ctx.switchToHttp().getRequest<DelegatedRequest>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const { claims, email, emailVerified, name } = await this.verifier.verify(token, profile);
      const principal = await this.mapper.mapToLocalPrincipal(
        email,
        emailVerified,
        name,
        profile.provisioning,
      );
      request.user = principal;
      request.delegationContext = claims;
      return true;
    } catch (error) {
      this.securityEventLogger.recordRejection(profileName, error);
      // Unified, opaque response regardless of the underlying reason (bad signature,
      // wrong audience, missing local account, ...) — see plan §9/§13.
      throw new UnauthorizedException('Invalid delegated token');
    }
  }
}

function extractBearerToken(request: DelegatedRequest): string | null {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) {
    return null;
  }
  const token = value.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
