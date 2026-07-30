import { describe, expect, it, vi } from 'vitest';

describe('JwtAuthGuard', () => {
  it('always uses the OIDC JWT strategy', async () => {
    vi.doMock('@nestjs/passport', () => ({
      AuthGuard: (strategyName: string) =>
        class {
          static strategyName = strategyName;
          canActivate() {
            return true;
          }
        },
    }));

    const { JwtAuthGuard } = await import('./jwt-auth.guard');

    expect((JwtAuthGuard as unknown as { strategyName: string }).strategyName).toBe('jwt-oidc');

    vi.doUnmock('@nestjs/passport');
    vi.resetModules();
  });
});
