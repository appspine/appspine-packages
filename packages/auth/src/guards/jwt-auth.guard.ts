import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// OIDC is the sole identity source (dev_docs/framework/035) — OidcStrategy is the only
// strategy AuthModule registers.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt-oidc') {}
