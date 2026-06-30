import { JwtAuthGuard } from '@appspine/auth';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiKeyGuard } from '../api-key.guard';

@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyGuard: ApiKeyGuard,
    private readonly jwtGuard: JwtAuthGuard,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // API key takes priority; false means "no X-Api-Key header", not an error
    const apiKeyPassed = await this.apiKeyGuard.canActivate(ctx);
    if (apiKeyPassed) return true;

    // Fallback to standard JWT
    return this.jwtGuard.canActivate(ctx) as Promise<boolean>;
  }
}
