import { expect, test } from '@playwright/test';

interface RegisterAuthSpecOptions {
  readonly baseURL: string;
  /** A Keycloak identity with no local User row pre-seeded anywhere — exercises JIT
   * provisioning's default-USER-role path (dev-infra/README.md's `dev-user`, or an
   * app-specific equivalent). `expectedEmail` is what the account menu should show once
   * the OIDC token's email claim resolves to (or JIT-creates) a local User. */
  readonly jitUser: {
    readonly username: string;
    readonly password: string;
    readonly expectedEmail: string;
  };
  /** See auth.fixture.ts's `signInButtonName` — same override, same reason. */
  readonly signInButtonName?: string;
}

export function registerAuthSpec({
  baseURL,
  jitUser,
  signInButtonName = 'Sign in with Keycloak',
}: RegisterAuthSpecOptions) {
  test.describe('auth', () => {
    test('logs in via the IdP and JIT-provisions a local User on first login', async ({
      page,
      context,
    }) => {
      // Force English so the locators below work regardless of the app's default locale.
      await context.addCookies([{ name: 'locale', value: 'en', url: baseURL }]);
      await page.goto(`${baseURL}/login`);
      await page.getByRole('button', { name: signInButtonName }).click();

      // Cross-origin redirect to the dev Keycloak's own login page (dev-infra/README.md).
      await page.waitForURL('**/protocol/openid-connect/auth**');
      await page.getByLabel('Username or email').fill(jitUser.username);
      await page.getByLabel('Password', { exact: true }).fill(jitUser.password);
      await page.getByRole('button', { name: 'Sign In' }).click();

      await page.waitForURL('**/dashboard');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      // The account menu's accessible name includes the resolved user's email — proves
      // /auth/me (server-side, via the Keycloak access token) matched or JIT-created a
      // local User for this exact OIDC identity, not just "some" session. A plain string
      // (not a RegExp) avoids a "+"-tagged address or any other regex-special character
      // in the email breaking the match — Playwright's string form does a substring,
      // case-insensitive match by default.
      await expect(page.getByRole('button', { name: jitUser.expectedEmail })).toBeVisible();

      // Note: this only exercises the *create* branch of JIT provisioning on an e2e
      // environment where jitUser's local User row doesn't already exist (e.g. a fresh
      // DB per run) — on a re-run against a already-provisioned identity, this instead
      // exercises the *lookup* branch. Either way it proves the account resolves to the
      // right identity; the fact that JIT-created users land on the default role (not
      // ADMIN) is separately, and repeatably, verified end-to-end by rbac.spec.ts's
      // "blocks non-admin users from admin pages" test, which uses this same jitUser via
      // the `userPage`/`userContext` fixtures.
    });
  });
}
