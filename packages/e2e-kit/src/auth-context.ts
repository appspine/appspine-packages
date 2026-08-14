import type { Browser, BrowserContext } from '@playwright/test';

export async function withBrowserContext<T>(
  browser: Browser,
  run: (context: BrowserContext) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext();
  try {
    return await run(context);
  } finally {
    await context.close();
  }
}
