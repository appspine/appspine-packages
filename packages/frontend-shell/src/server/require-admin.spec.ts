import { describe, expect, it, vi } from 'vitest';
import type { CurrentUser } from './current-user.js';
import { createRequireAdminPage } from './require-admin.js';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

describe('createRequireAdminPage', () => {
  it('returns the user if ADMIN role is present', async () => {
    const adminUser: CurrentUser = {
      sub: 'sub-1',
      email: 'admin@example.com',
      name: 'Admin User',
      roleName: 'ADMIN',
      roleNames: ['USER', 'ADMIN'],
      permissionPolicy: 'ALLOW_ALL',
      permissions: [],
    };

    const requireAdminPage = createRequireAdminPage(async () => adminUser);
    const result = await requireAdminPage();
    expect(result).toBe(adminUser);
  });

  it('redirects to /unauthorized by default when user is null', async () => {
    const requireAdminPage = createRequireAdminPage(async () => null);
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/unauthorized');
  });

  it('redirects to /unauthorized by default when user is not ADMIN', async () => {
    const regularUser: CurrentUser = {
      sub: 'sub-2',
      email: 'user@example.com',
      name: 'Regular User',
      roleName: 'USER',
      roleNames: ['USER'],
      permissionPolicy: 'DENY_ALL',
      permissions: [],
    };

    const requireAdminPage = createRequireAdminPage(async () => regularUser);
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/unauthorized');
  });

  it('redirects to a custom unauthorized path if provided', async () => {
    const requireAdminPage = createRequireAdminPage(async () => null, '/custom-403');
    await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/custom-403');
  });
});
