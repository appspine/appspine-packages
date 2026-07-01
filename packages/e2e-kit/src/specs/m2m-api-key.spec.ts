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
  readonly protectedEndpoint?: string;
  readonly restrictedScope?: string;
  readonly wildcardScope?: string;
  readonly apiKeyValueLocator?: string;
}

async function createApiKeyFromUi(
  adminPage: AuthFixtures['adminPage'],
  options: { name: string; roleOptionName: string; scopes: string[]; apiKeyValueLocator: string },
) {
  await adminPage.goto('/dashboard/api-keys');
  await adminPage.getByRole('button', { name: 'New API Key' }).click();
  const dialog = adminPage.getByRole('dialog', { name: 'Create API key' });
  await dialog.getByLabel('Name').fill(options.name);
  await dialog.getByLabel('Role').click();
  await adminPage.getByRole('option', { name: options.roleOptionName }).click();

  for (const scope of options.scopes) {
    await dialog.getByLabel(scope, { exact: true }).click();
  }

  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(adminPage.getByRole('heading', { name: 'API key created' })).toBeVisible();

  const key = (await adminPage.locator(options.apiKeyValueLocator).textContent())?.trim();
  expect(key).toBeTruthy();

  await adminPage.keyboard.press('Escape');

  return key as string;
}

export function registerM2mApiKeySpec({
  test,
  baseURL,
  apiURL,
  roleOptionName,
  protectedEndpoint = '/metadata/schema',
  restrictedScope = 'users:read',
  wildcardScope = '* (full access)',
  apiKeyValueLocator = '.break-all.rounded-md.border.bg-muted',
}: RegisterM2mApiKeySpecOptions) {
  test.describe('m2m api keys', () => {
    test('enforces API key scopes on metadata schema access', async ({ adminPage, request }) => {
      await adminPage.goto(`${baseURL}/dashboard/api-keys`);

      const restrictedKey = await createApiKeyFromUi(adminPage, {
        name: `restricted-${Date.now()}`,
        roleOptionName,
        scopes: [restrictedScope],
        apiKeyValueLocator,
      });

      const restrictedResponse = await request.get(`${apiURL}${protectedEndpoint}`, {
        headers: {
          'x-api-key': restrictedKey,
        },
      });
      expect(restrictedResponse.status()).toBe(403);

      const wildcardKey = await createApiKeyFromUi(adminPage, {
        name: `wildcard-${Date.now()}`,
        roleOptionName,
        scopes: [wildcardScope],
        apiKeyValueLocator,
      });

      const allowedResponse = await request.get(`${apiURL}${protectedEndpoint}`, {
        headers: {
          'x-api-key': wildcardKey,
        },
      });
      expect(allowedResponse.ok()).toBeTruthy();

      const schema = (await allowedResponse.json()) as {
        models?: unknown[];
        availableScopes?: unknown[];
      };
      expect(Array.isArray(schema.models)).toBeTruthy();
      expect(Array.isArray(schema.availableScopes)).toBeTruthy();
    });
  });
}
