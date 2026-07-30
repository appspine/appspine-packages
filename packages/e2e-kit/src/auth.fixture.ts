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
  /** Keycloak username (not the app-side email — see dev-infra/README.md's test user
   * table). Identity is JIT-provisioned/matched locally by the token's email claim,
   * there is no separate "register" step under OIDC-only auth. */
  readonly username: string;
  readonly password: string;
  readonly storageStatePath: string;
}

interface CreateAuthFixturesOptions {
  readonly baseURL: string;
  readonly admin: AuthUserConfig;
  readonly user?: AuthUserConfig;
  /** Accessible name of the login page's sign-in button. Every app currently uses the
   * same English copy for this (`LoginButton`'s `label` prop, translated as
   * "Sign in with Keycloak" in every app's en.json), and this fixture forces English via
   * a locale cookie regardless of the app's default locale — but an app whose en catalog
   * ever uses different wording would otherwise break this fixture with an opaque
   * timeout. Override here instead of forking the fixture. */
  readonly signInButtonName?: string;
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

async function loginAndSaveStorageState(
  browser: Browser,
  baseURL: string,
  user: AuthUserConfig,
  signInButtonName: string,
) {
  await ensureAuthDirectory(user.storageStatePath);

  const context = await browser.newContext();
  // Force English so this fixture's English-language locators (getByRole('button', {
  // name: signInButtonName }), etc.) work regardless of the app's default locale
  // (e.g. appspine-app-template defaults to zh-TW). Saved into storageState below, so it
  // carries over into adminContext/userContext too.
  await context.addCookies([{ name: 'locale', value: 'en', url: baseURL }]);
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  await page.getByRole('button', { name: signInButtonName }).click();

  // Cross-origin redirect to the dev Keycloak's own login page (dev-infra/README.md).
  await page.waitForURL('**/protocol/openid-connect/auth**');
  await page.getByLabel('Username or email').fill(user.username);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  try {
    await page.waitForURL('**/dashboard');
  } catch (error) {
    throw new Error(
      `Login timed out for ${user.username} — Keycloak may have denied this identity access ` +
        `to this app's client (dev-infra/README.md's per-client access restriction — check ` +
        `the identity is in the right group), or the login form/redirect no longer matches ` +
        `this fixture's assumptions. Original error: ${(error as Error).message}`,
    );
  }

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await context.storageState({ path: resolve(user.storageStatePath) });
  await page.close();
  await context.close();
}

async function ensureStorageState(
  browser: Browser,
  baseURL: string,
  signInButtonName: string,
  user?: AuthUserConfig,
) {
  if (!user) {
    return undefined;
  }

  await loginAndSaveStorageState(browser, baseURL, user, signInButtonName);
  return resolve(user.storageStatePath);
}

export function createAuthFixtures({
  baseURL,
  admin,
  user,
  signInButtonName = 'Sign in with Keycloak',
}: CreateAuthFixturesOptions) {
  return base.extend<AuthFixtures>({
    adminContext: async ({ browser }, use) => {
      const storageState = await ensureStorageState(browser, baseURL, signInButtonName, admin);
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
      const storageState = await ensureStorageState(browser, baseURL, signInButtonName, user);
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
