import { describe, expect, it } from 'vitest';
import { createPlaywrightConfig } from './config';

describe('createPlaywrightConfig', () => {
  it('provides stable defaults for shared e2e consumers', () => {
    const config = createPlaywrightConfig({
      baseURL: 'http://localhost:3001',
      apiURL: 'http://localhost:3000',
    });

    expect(config.testDir).toBe('./e2e');
    expect(config.outputDir).toBe('test-results');
    expect(config.fullyParallel).toBe(false);
    expect(config.use).toMatchObject({
      baseURL: 'http://localhost:3001',
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      extraHTTPHeaders: { 'x-appspine-api-url': 'http://localhost:3000' },
    });
  });

  it('passes through consumer overrides, including storage state', () => {
    const reporter = 'dot';
    const config = createPlaywrightConfig({
      baseURL: 'https://app.example',
      apiURL: 'https://api.example',
      testDir: './acceptance',
      outputDir: 'artifacts',
      storageStatePath: './playwright/.auth/admin.json',
      reporter,
    });

    expect(config.testDir).toBe('./acceptance');
    expect(config.outputDir).toBe('artifacts');
    expect(config.reporter).toEqual(reporter);
    expect(config.use).toMatchObject({
      baseURL: 'https://app.example',
      storageState: './playwright/.auth/admin.json',
      extraHTTPHeaders: { 'x-appspine-api-url': 'https://api.example' },
    });
  });
});
