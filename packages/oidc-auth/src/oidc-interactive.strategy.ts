import type { Principal } from '@appspine/plugin-api';
import type { AuthenticationStrategy } from '@appspine/plugin-host-nest';
import { type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtVerifierService } from './jwt-verifier.service';

const BEARER = /^Bearer (.+)$/i;

/**
 * Registers OIDC as *the* interactive authentication provider (PL1-11).
 *
 * This is the adapter that lets a business controller say "a human must be logged in"
 * (`InteractiveAuthGuard`) without naming OIDC. Everything it does is delegated to
 * `JwtVerifierService`, so the neutral guard and the legacy `JwtAuthGuard` accept exactly the same
 * tokens and reject exactly the same ones.
 */
@Injectable()
export class OidcInteractiveStrategy implements AuthenticationStrategy {
  readonly id = 'oidc';
  readonly kind = 'interactive' as const;

  constructor(private readonly jwtVerifier: JwtVerifierService) {}

  async authenticate(context: ExecutionContext): Promise<Principal | null> {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const header = request?.headers?.authorization;
    // A single, well-formed bearer header or nothing: Express hands back `string[]` for duplicate
    // headers, and picking one of two Authorization headers is a decision no guard should make.
    if (typeof header !== 'string') return null;

    const match = BEARER.exec(header);
    if (!match) return null;

    try {
      return await this.jwtVerifier.verifyJwtToken(match[1]);
    } catch (error) {
      // The request *did* present a bearer token and it was not valid. Returning `null` here would
      // let the host fall through to a machine strategy, turning an expired login into a
      // differently-authenticated request instead of a 401.
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid JWT');
    }
  }
}
