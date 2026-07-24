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
  restrictedScope,
  wildcardScope = '* (full access)',
  apiKeyValueLocator = '.break-all.rounded-md.border.bg-muted',
}: RegisterM2mApiKeySpecOptions) {
  test.describe('m2m api keys', () => {
    test('enforces API key scopes on metadata schema access', async ({ adminPage, request }) => {
      await adminPage.goto(`${baseURL}/dashboard/api-keys`);

      // Create the wildcard key first: metadata-schema's availableScopes is derived from
      // each app's own Prisma models (@appspine/metadata-schema's deriveScopes, which also
      // excludes anything documented `@internal` -- e.g. User), so there is no fixed
      // "users:read"-style scope string guaranteed to exist across every app. Discover a
      // real one from this app's own schema response instead of hardcoding a guess.
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
        availableScopes?: string[];
      };
      expect(Array.isArray(schema.models)).toBeTruthy();
      expect(Array.isArray(schema.availableScopes)).toBeTruthy();

      const discoveredScope =
        restrictedScope ?? schema.availableScopes?.find((scope) => !scope.endsWith(':*'));
      if (!discoveredScope) {
        throw new Error(
          'registerM2mApiKeySpec: no non-wildcard scope available to test restriction against -- ' +
            'pass an explicit restrictedScope, or expose at least one non-@internal model through metadata-schema.',
        );
      }

      const restrictedKey = await createApiKeyFromUi(adminPage, {
        name: `restricted-${Date.now()}`,
        roleOptionName,
        scopes: [discoveredScope],
        apiKeyValueLocator,
      });

      const restrictedResponse = await request.get(`${apiURL}${protectedEndpoint}`, {
        headers: {
          'x-api-key': restrictedKey,
        },
      });
      expect(restrictedResponse.status()).toBe(403);
    });
  });
}
