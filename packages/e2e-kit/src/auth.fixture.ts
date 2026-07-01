import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  type Browser,
  type BrowserContext,
  test as base,
  expect,
  type Page,
} from '@playwright/test';

export interface AuthUserConfig {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
  readonly storageStatePath: string;
  readonly createViaRegisterApi?: boolean;
}

interface CreateAuthFixturesOptions {
  readonly baseURL: string;
  readonly apiURL: string;
  readonly admin: AuthUserConfig;
  readonly user?: AuthUserConfig;
}

export interface AuthFixtures {
  adminPage: Page;
  adminContext: BrowserContext;
  userPage: Page;
  userContext: BrowserContext;
}

async function ensureAuthDirectory(storageStatePath: string) {
  await mkdir(dirname(resolve(storageStatePath)), { recursive: true });
}

async function ensureRegisteredUser(apiURL: string, user: AuthUserConfig) {
  const response = await fetch(`${apiURL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      name: user.name,
    }),
  });

  if (response.ok) {
    return;
  }

  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (body?.message?.includes('already exists')) {
      return;
    }
  }

  throw new Error(`Failed to ensure registered user ${user.email}: HTTP ${response.status}`);
}

async function loginAndSaveStorageState(browser: Browser, baseURL: string, user: AuthUserConfig) {
  await ensureAuthDirectory(user.storageStatePath);

  const page = await browser.newPage();
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.context().storageState({ path: resolve(user.storageStatePath) });
  await page.close();
}

async function ensureStorageState(
  browser: Browser,
  baseURL: string,
  apiURL: string,
  user?: AuthUserConfig,
) {
  if (!user) {
    return undefined;
  }

  if (user.createViaRegisterApi) {
    await ensureRegisteredUser(apiURL, user);
  }

  await loginAndSaveStorageState(browser, baseURL, user);
  return resolve(user.storageStatePath);
}

export function createAuthFixtures({ baseURL, apiURL, admin, user }: CreateAuthFixturesOptions) {
  return base.extend<AuthFixtures>({
    adminContext: async ({ browser }, use) => {
      const storageState = await ensureStorageState(browser, baseURL, apiURL, admin);
      const context = await browser.newContext({ storageState });
      await use(context);
      await context.close();
    },
    adminPage: async ({ adminContext }, use) => {
      const page = await adminContext.newPage();
      await use(page);
      await page.close();
    },
    userContext: async ({ browser }, use) => {
      const storageState = await ensureStorageState(browser, baseURL, apiURL, user);
      const context = await browser.newContext({ storageState });
      await use(context);
      await context.close();
    },
    userPage: async ({ userContext }, use) => {
      const page = await userContext.newPage();
      await use(page);
      await page.close();
    },
  });
}

export { expect };
