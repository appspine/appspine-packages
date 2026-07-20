import { afterEach, describe, expect, it, vi } from 'vitest';

const originalAuthMode = process.env.AUTH_MODE;

function restoreAuthMode() {
  if (originalAuthMode === undefined) {
    delete process.env.AUTH_MODE;
  } else {
    process.env.AUTH_MODE = originalAuthMode;
  }
}

async function loadGuardStrategy(authMode: string | undefined) {
  vi.resetModules();
  vi.doMock('@nestjs/passport', () => ({
    AuthGuard: (strategyName: string) =>
      class {
        static strategyName = strategyName;

        canActivate() {
          return true;
        }
      },
  }));

  if (authMode === undefined) {
    delete process.env.AUTH_MODE;
  } else {
    process.env.AUTH_MODE = authMode;
  }

  const { JwtAuthGuard } = await import('./jwt-auth.guard');
  return (JwtAuthGuard as unknown as { strategyName: string }).strategyName;
}

describe('JwtAuthGuard', () => {
  afterEach(() => {
    vi.doUnmock('@nestjs/passport');
    vi.resetModules();
    restoreAuthMode();
  });

  it('uses the local JWT strategy by default', async () => {
    await expect(loadGuardStrategy(undefined)).resolves.toBe('jwt-local');
  });

  it('uses the local JWT strategy when AUTH_MODE=local', async () => {
    await expect(loadGuardStrategy('local')).resolves.toBe('jwt-local');
  });

  it('uses the OIDC JWT strategy when AUTH_MODE=oidc', async () => {
    await expect(loadGuardStrategy('oidc')).resolves.toBe('jwt-oidc');
  });
});
