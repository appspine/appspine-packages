import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationPollingController } from './frontend/use-notification-polling';
import {
  cleanupNotificationResources,
  notificationPlugin,
  registerNotificationCleanup,
} from './plugin';

describe('worker and polling lifecycle cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await cleanupNotificationResources();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('executes registered cleanup handlers on plugin shutdown', async () => {
    const workerCleanup = vi.fn();
    const pollerCleanup = vi.fn();

    registerNotificationCleanup(workerCleanup);
    registerNotificationCleanup(pollerCleanup);

    const context = {
      pluginId: 'notification',
      instanceId: 'default',
      key: 'notification#default',
      config: {},
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      capabilities: { get: vi.fn(), getOptional: vi.fn(), has: vi.fn() },
    };

    await notificationPlugin.lifecycle?.shutdown?.(context);

    expect(workerCleanup).toHaveBeenCalledOnce();
    expect(pollerCleanup).toHaveBeenCalledOnce();
    expect(context.logger.info).toHaveBeenCalledWith(
      'notification plugin shutting down, cleaning up active resources',
    );
  });

  it('allows unregistering a cleanup handler before shutdown occurs', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const unregister1 = registerNotificationCleanup(handler1);
    registerNotificationCleanup(handler2);

    // Unregister handler1
    unregister1();

    await cleanupNotificationResources();

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('continues executing remaining cleanup handlers if one throws an error', async () => {
    const faultyCleanup = vi.fn().mockRejectedValue(new Error('Cleanup failure'));
    const safeCleanup = vi.fn().mockResolvedValue(undefined);

    registerNotificationCleanup(faultyCleanup);
    registerNotificationCleanup(safeCleanup);

    await expect(cleanupNotificationResources()).resolves.toBeUndefined();

    expect(faultyCleanup).toHaveBeenCalledOnce();
    expect(safeCleanup).toHaveBeenCalledOnce();
  });

  it('cleans up frontend polling controller timers when stopped', async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 5 });
    const onCount = vi.fn();

    const controller = createNotificationPollingController({
      loadUnreadCount: fetcher,
      intervalMs: 5000,
      onCount,
    });

    // Start polling
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Fast-forward 5s -> should poll again
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Stop polling
    controller.stop();

    // Fast-forward another 10s -> should NOT poll again
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('integrates polling controller with plugin shutdown cleanup', async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 2 });
    const controller = createNotificationPollingController({
      loadUnreadCount: fetcher,
      intervalMs: 3000,
    });

    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Register poller stop with plugin cleanup
    const unregister = registerNotificationCleanup(() => controller.stop());

    // Advance 3s
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Shutdown plugin
    await cleanupNotificationResources();

    // Advance time further -> no more polling
    await vi.advanceTimersByTimeAsync(9000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    unregister();
  });
});
