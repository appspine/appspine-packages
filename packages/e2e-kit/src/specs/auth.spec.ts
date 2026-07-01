import { expect, test } from '@playwright/test';

interface RegisterAuthSpecOptions {
  readonly baseURL: string;
  readonly apiURL: string;
  readonly authCookieName?: string;
}

function buildUniqueUser() {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `e2e-auth-${nonce}@example.com`,
    password: 'Passw0rd!234',
    name: `E2E Auth ${nonce}`,
  };
}

export function registerAuthSpec({
  baseURL,
  apiURL,
  authCookieName = 'auth_token',
}: RegisterAuthSpecOptions) {
  test.describe('auth', () => {
    test('registers through the API, logs in through the UI, and resolves /auth/me', async ({
      page,
      request,
    }) => {
      const user = buildUniqueUser();

      const registerResponse = await request.post(`${apiURL}/auth/register`, {
        data: user,
      });
      expect(registerResponse.ok()).toBeTruthy();

      await page.goto(`${baseURL}/login`);
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await page.waitForURL('**/dashboard');
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      const cookies = await page.context().cookies();
      const authCookie = cookies.find((cookie) => cookie.name === authCookieName);
      expect(authCookie?.value).toBeTruthy();

      const meResponse = await request.get(`${apiURL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${authCookie?.value}`,
        },
      });

      expect(meResponse.ok()).toBeTruthy();
      await expect
        .poll(async () => {
          const body = (await meResponse.json()) as {
            email: string;
            roleNames: string[];
          };

          return {
            email: body.email,
            roleNames: body.roleNames,
          };
        })
        .toEqual({
          email: user.email,
          roleNames: ['USER'],
        });
    });
  });
}
