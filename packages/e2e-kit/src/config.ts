import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

interface CreatePlaywrightConfigOptions {
  readonly baseURL: string;
  readonly apiURL: string;
  readonly testDir?: string;
  readonly outputDir?: string;
  readonly storageStatePath?: string | undefined;
  readonly reporter?: PlaywrightTestConfig['reporter'];
}

export function createPlaywrightConfig({
  baseURL,
  apiURL,
  testDir = './e2e',
  outputDir = 'test-results',
  storageStatePath,
  reporter = [['list'], ['html', { open: 'never' }]],
}: CreatePlaywrightConfigOptions) {
  return defineConfig({
    testDir,
    outputDir,
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter,
    use: {
      baseURL,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      extraHTTPHeaders: {
        'x-appspine-api-url': apiURL,
      },
      storageState: storageStatePath,
    },
    projects: [
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
        },
      },
    ],
  });
}
