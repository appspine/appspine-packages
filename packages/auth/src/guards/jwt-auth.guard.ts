import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// AUTH_MODE is fixed for the lifetime of a deployed process (dev_docs 001), so the
// strategy is resolved once at module-load time rather than per-request.
const STRATEGY_NAME = process.env.AUTH_MODE === 'oidc' ? 'jwt-oidc' : 'jwt-local';

/** Validates the bearer token using whichever strategy matches AUTH_MODE. */
@Injectable()
export class JwtAuthGuard extends AuthGuard(STRATEGY_NAME) {}
