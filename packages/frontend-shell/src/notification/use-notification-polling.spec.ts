import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNotificationPollingController } from './use-notification-polling.js';

describe('createNotificationPollingController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates, polls at a bounded interval, and clamps invalid counts', async () => {
    vi.useFakeTimers();
    const counts = [5, 101, Number.NaN];
    const onCount = vi.fn();
    const controller = createNotificationPollingController({
      loadUnreadCount: vi.fn(async () => counts.shift() ?? 0),
      intervalMs: 1000,
      onCount,
    });

    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onCount).toHaveBeenLastCalledWith(5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onCount).toHaveBeenLastCalledWith(101);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onCount).toHaveBeenLastCalledWith(0);
    controller.stop();
  });

  it('does not overlap requests and refreshes when visibility returns', async () => {
    vi.useFakeTimers();
    let resolve: ((value: number) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<number>((res) => {
          resolve = res;
        }),
    );
    const onCount = vi.fn();
    const controller = createNotificationPollingController({
      loadUnreadCount: load,
      intervalMs: 1000,
      onCount,
    });

    controller.start();
    controller.setVisible(false);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(1);
    resolve?.(3);
    await vi.advanceTimersByTimeAsync(0);
    controller.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it('ignores late failures after stop', async () => {
    const onError = vi.fn();
    let reject: ((error: Error) => void) | undefined;
    const controller = createNotificationPollingController({
      loadUnreadCount: () =>
        new Promise<number>((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
      onError,
    });

    controller.start();
    controller.stop();
    reject?.(new Error('stale'));
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
  });
});
