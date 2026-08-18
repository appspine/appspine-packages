import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SYSTEM_ADMIN_ROLE } from '../constants';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionGuard } from './permission.guard';

vi.mock('@appspine/common', () => ({
  PermissionPolicy: {
    DENY_ALL: 'DENY_ALL',
    ALLOW_ALL: 'ALLOW_ALL',
    READ_ALL: 'READ_ALL',
  },
}));

function mockCtx(opts: {
  handlerPerms?: string[];
  classPerms?: string[];
  user?: { roleNames?: string[]; permissionPolicy?: string; permissions?: string[] };
}) {
  const handler = () => undefined;
  class Ctrl {}
  if (opts.handlerPerms) {
    Reflect.defineMetadata(PERMISSIONS_KEY, opts.handlerPerms, handler);
  }
  if (opts.classPerms) {
    Reflect.defineMetadata(PERMISSIONS_KEY, opts.classPerms, Ctrl);
  }
  return {
    getHandler: () => handler,
    getClass: () => Ctrl,
    switchToHttp: () => ({
      getRequest: () => ({ user: opts.user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  const guard = new PermissionGuard();

  it('should allow access if no permissions are required (no metadata)', () => {
    const ctx = mockCtx({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access if required permissions array is empty', () => {
    const ctx = mockCtx({ handlerPerms: [] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException if permissions are required but user is missing', () => {
    const ctx = mockCtx({ handlerPerms: ['READ_POST'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow access if user is a SYSTEM_ADMIN', () => {
    const ctx = mockCtx({
      handlerPerms: ['READ_POST'],
      user: { roleNames: [SYSTEM_ADMIN_ROLE] },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access if user has ALLOW_ALL permission policy', () => {
    const ctx = mockCtx({
      handlerPerms: ['WRITE_POST'],
      user: { permissionPolicy: 'ALLOW_ALL' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access if user has READ_ALL policy and required permission ends with _READ', () => {
    const ctx = mockCtx({
      handlerPerms: ['POST_READ'],
      user: { permissionPolicy: 'READ_ALL' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException if user has READ_ALL policy but required permission does not end with _READ', () => {
    const ctx = mockCtx({
      handlerPerms: ['POST_WRITE'],
      user: { permissionPolicy: 'READ_ALL', permissions: [] },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow access if user has explicit permission (OR logic)', () => {
    const ctx = mockCtx({
      handlerPerms: ['POST_WRITE', 'POST_DELETE'],
      user: { permissions: ['POST_WRITE'] },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException if user lacks required explicit permissions', () => {
    const ctx = mockCtx({
      handlerPerms: ['POST_WRITE', 'POST_DELETE'],
      user: { permissions: ['POST_READ'] },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should prioritize handler metadata over class metadata', () => {
    // Handler requires POST_WRITE, Class requires POST_READ.
    // User has POST_WRITE (so should pass if handler is prioritized, or fail if class is prioritized/merged incorrectly).
    const ctx = mockCtx({
      handlerPerms: ['POST_WRITE'],
      classPerms: ['POST_READ'],
      user: { permissions: ['POST_WRITE'] },
    });
    expect(guard.canActivate(ctx)).toBe(true);

    // If user only has POST_READ, it should fail because handler metadata takes priority.
    const ctx2 = mockCtx({
      handlerPerms: ['POST_WRITE'],
      classPerms: ['POST_READ'],
      user: { permissions: ['POST_READ'] },
    });
    expect(() => guard.canActivate(ctx2)).toThrow(ForbiddenException);
  });
});
