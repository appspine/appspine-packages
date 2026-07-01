import type { APIRequestContext, PlaywrightTestArgs, TestType } from '@playwright/test';
import { expect } from '@playwright/test';

import type { AuthFixtures } from '../auth.fixture';

interface RegisterM2mApiKeySpecOptions {
  readonly test: TestType<
    AuthFixtures & PlaywrightTestArgs & { request: APIRequestContext },
    object
  >;
  readonly baseURL: string;
  readonly apiURL: string;
  readonly roleOptionName: string;
}

async function createApiKeyFromUi(
  adminPage: AuthFixtures['adminPage'],
  options: { name: string; roleOptionName: string; scopes: string[] },
) {
  await adminPage.goto('/dashboard/api-keys');
  await adminPage.getByRole('button', { name: 'New API Key' }).click();
  await adminPage.getByLabel('Name').fill(options.name);
  await adminPage.getByLabel('Role').click();
  await adminPage.getByRole('option', { name: options.roleOptionName }).click();

  for (const scope of options.scopes) {
    await adminPage.getByText(scope, { exact: true }).click();
  }

  await adminPage.getByRole('button', { name: 'Create' }).click();
  await expect(adminPage.getByRole('heading', { name: 'API key created' })).toBeVisible();

  const key = (
    await adminPage.locator('.break-all.rounded-md.border.bg-muted').textContent()
  )?.trim();
  expect(key).toBeTruthy();

  await adminPage.getByRole('button', { name: 'Copy to clipboard' }).click();
  await adminPage.getByRole('button', { name: "I've copied it, done" }).click();

  return key as string;
}

export function registerM2mApiKeySpec({
  test,
  baseURL,
  apiURL,
  roleOptionName,
}: RegisterM2mApiKeySpecOptions) {
  test.describe('m2m api keys', () => {
    test('enforces API key scopes on metadata schema access', async ({ adminPage, request }) => {
      await adminPage.goto(`${baseURL}/dashboard/api-keys`);

      const restrictedKey = await createApiKeyFromUi(adminPage, {
        name: `restricted-${Date.now()}`,
        roleOptionName,
        scopes: ['users:read'],
      });

      const restrictedResponse = await request.get(`${apiURL}/metadata/schema`, {
        headers: {
          'x-api-key': restrictedKey,
        },
      });
      expect(restrictedResponse.status()).toBe(403);

      const wildcardKey = await createApiKeyFromUi(adminPage, {
        name: `wildcard-${Date.now()}`,
        roleOptionName,
        scopes: ['* (full access)'],
      });

      const allowedResponse = await request.get(`${apiURL}/metadata/schema`, {
        headers: {
          'x-api-key': wildcardKey,
        },
      });
      expect(allowedResponse.ok()).toBeTruthy();

      const schema = (await allowedResponse.json()) as {
        models?: unknown[];
        scopeCatalog?: unknown[];
      };
      expect(Array.isArray(schema.models)).toBeTruthy();
      expect(Array.isArray(schema.scopeCatalog)).toBeTruthy();
    });
  });
}
