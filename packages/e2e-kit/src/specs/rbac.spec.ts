import type { Page, PlaywrightTestArgs, TestType } from '@playwright/test';
import { expect } from '@playwright/test';

import type { AuthFixtures } from '../auth.fixture';

interface RegisterRbacSpecOptions {
  readonly test: TestType<AuthFixtures & PlaywrightTestArgs & { page: Page }, object>;
  readonly baseURL: string;
  readonly unauthorizedPath?: string;
  readonly protectedPaths?: readonly string[];
}

export function registerRbacSpec({
  test,
  baseURL,
  unauthorizedPath = '/unauthorized',
  protectedPaths = ['/dashboard/users', '/dashboard/roles', '/dashboard/api-keys'],
}: RegisterRbacSpecOptions) {
  test.describe('rbac', () => {
    test('redirects anonymous users to /login', async ({ page }) => {
      await page.goto(`${baseURL}${protectedPaths[0]}`);
      await page.waitForURL('**/login');
      await expect(page.getByText('Sign in').first()).toBeVisible();
    });

    test('blocks non-admin users from admin pages', async ({ userPage }) => {
      await userPage.goto(`${baseURL}${protectedPaths[0]}`);
      await userPage.waitForURL(`**${unauthorizedPath}`);
      await expect(userPage.getByText(/Unauthorized/i)).toBeVisible();
    });

    for (const protectedPath of protectedPaths) {
      test(`allows admin users to open ${protectedPath}`, async ({ adminPage }) => {
        await adminPage.goto(`${baseURL}${protectedPath}`);
        await adminPage.waitForURL(`**${protectedPath}`);
        await expect(adminPage.getByRole('heading').first()).toBeVisible();
      });
    }
  });
}
