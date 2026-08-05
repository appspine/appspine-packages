// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createNotificationPollingController,
  useNotificationPolling,
} from './use-notification-polling.js';

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

  it('does not start a request when the page is already hidden', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => 4);
    const controller = createNotificationPollingController({
      loadUnreadCount: load,
      intervalMs: 1000,
    });

    controller.setVisible(false);
    controller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).not.toHaveBeenCalled();

    controller.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
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

describe('useNotificationPolling', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    container = undefined;
    root = undefined;
    vi.useRealTimers();
  });

  function mountHook(options: Parameters<typeof useNotificationPolling>[0]) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    let latest!: ReturnType<typeof useNotificationPolling>;
    function Harness() {
      latest = useNotificationPolling(options);
      return null;
    }
    act(() => {
      root?.render(createElement(Harness));
    });
    return () => latest;
  }

  it('exposes the hydrated initial count without a loading flash', async () => {
    vi.useFakeTimers();
    const getState = mountHook({
      loadUnreadCount: vi.fn(async () => 9),
      initialUnreadCount: 4,
      intervalMs: 1000,
    });
    expect(getState().count).toBe(4);
    expect(getState().isLoading).toBe(false);

    // Let the mount-time poll settle inside act() so its state update doesn't leak into a later
    // test unwrapped.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it('refresh() shares the controller in-flight guard instead of firing a duplicate overlapping request', async () => {
    vi.useFakeTimers();
    let resolveFirst: ((value: number) => void) | undefined;
    const loadUnreadCount = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const getState = mountHook({ loadUnreadCount, intervalMs: 1000 });

    // The initial mount-time poll is now in flight (unresolved).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loadUnreadCount).toHaveBeenCalledTimes(1);

    // A manual refresh() while a request is already in flight must not start a second one — this
    // is exactly the "pile-up" behavior the standalone (pre-fix) refresh() implementation lacked.
    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = getState().refresh();
    });
    expect(loadUnreadCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.(7);
      await refreshPromise;
    });

    expect(getState().count).toBe(7);
    expect(loadUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('does not update state after unmount', async () => {
    vi.useFakeTimers();
    let resolveCount: ((value: number) => void) | undefined;
    const loadUnreadCount = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveCount = resolve;
        }),
    );
    mountHook({ loadUnreadCount, intervalMs: 1000 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => root?.unmount());
    root = undefined;

    // Resolving after unmount must not throw or trigger a React "set state on unmounted
    // component" warning; if it did, this would fail the test via an uncaught rejection/warning.
    await act(async () => {
      resolveCount?.(3);
      await Promise.resolve();
    });
  });
});
