import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { SYSTEM_ADMIN_ROLE } from '../constants';
import { AdminGuard } from './admin.guard';

function createContext(user?: { roleNames?: string[] }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('AdminGuard', () => {
  it('allows users with the system admin role', () => {
    expect(
      new AdminGuard().canActivate(createContext({ roleNames: ['USER', SYSTEM_ADMIN_ROLE] })),
    ).toBe(true);
  });

  it('denies users without the system admin role', () => {
    expect(() => new AdminGuard().canActivate(createContext({ roleNames: ['USER'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('denies unauthenticated requests', () => {
    expect(() => new AdminGuard().canActivate(createContext())).toThrow(ForbiddenException);
  });
});
