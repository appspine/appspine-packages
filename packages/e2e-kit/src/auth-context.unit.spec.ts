import { describe, expect, it, vi } from 'vitest';
import { withBrowserContext } from './auth-context';

describe('withBrowserContext', () => {
  function createBrowser() {
    const context = { close: vi.fn().mockResolvedValue(undefined) };
    const browser = { newContext: vi.fn().mockResolvedValue(context) };
    return { browser, context };
  }

  it('closes the context after a successful operation', async () => {
    const { browser, context } = createBrowser();

    await expect(withBrowserContext(browser as never, async () => 'done')).resolves.toBe('done');

    expect(context.close).toHaveBeenCalledOnce();
  });

  it('closes the context when the operation fails', async () => {
    const { browser, context } = createBrowser();
    const failure = new Error('login failed');

    await expect(
      withBrowserContext(browser as never, async () => Promise.reject(failure)),
    ).rejects.toBe(failure);

    expect(context.close).toHaveBeenCalledOnce();
  });
});
