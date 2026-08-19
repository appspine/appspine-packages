import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  NotificationCountResult,
  NotificationPollingController,
  NotificationPollingOptions,
  NotificationPollingState,
} from './types.js';

const DEFAULT_INTERVAL_MS = 30_000;

export function createNotificationPollingController(
  options: NotificationPollingOptions,
): NotificationPollingController {
  const intervalMs = Math.max(1000, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> | undefined;
  let visible = true;
  let active = false;
  let requestSequence = 0;

  const issueRequest = (): Promise<void> => {
    const sequence = ++requestSequence;
    const promise: Promise<void> = Promise.resolve()
      .then(() => options.loadUnreadCount())
      .then((result) => {
        if (sequence !== requestSequence) return;
        const next = typeof result === 'number' ? result : result.count;
        options.onCount?.(Math.max(0, Number.isFinite(next) ? next : 0));
      })
      .catch((error: unknown) => {
        if (sequence === requestSequence) options.onError?.(error);
      })
      .finally(() => {
        if (inFlight === promise) inFlight = undefined;
      });
    inFlight = promise;
    return promise;
  };

  const refresh = async () => {
    if (!active || !visible) return;
    await (inFlight ?? issueRequest());
  };

  const forceRefresh = async () => {
    if (!active) return;
    await issueRequest();
  };

  const start = () => {
    if (active) return;
    active = true;
    if (options.enabled === false) return;
    void refresh();
    timer = setInterval(() => void refresh(), intervalMs);
  };

  const stop = () => {
    active = false;
    requestSequence++;
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  const setVisible = (nextVisible: boolean) => {
    visible = nextVisible;
    if (visible && active && options.enabled !== false) void refresh();
  };

  return { refresh, forceRefresh, start, stop, setVisible };
}

export function useNotificationPolling(
  options: NotificationPollingOptions,
): NotificationPollingState {
  const [count, setCount] = useState(() => Math.max(0, options.initialUnreadCount ?? 0));
  const [isLoading, setIsLoading] = useState(options.initialUnreadCount === undefined);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);
  const loadUnreadCountRef = useRef(options.loadUnreadCount);
  loadUnreadCountRef.current = options.loadUnreadCount;
  const controllerRef = useRef<NotificationPollingController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const controller = createNotificationPollingController({
      loadUnreadCount: () => loadUnreadCountRef.current(),
      intervalMs: options.intervalMs,
      enabled: options.enabled,
      onCount: (next) => {
        if (!mountedRef.current) return;
        setCount(next);
        setError(null);
        setIsLoading(false);
      },
      onError: (nextError) => {
        if (!mountedRef.current) return;
        setError(nextError);
        setIsLoading(false);
      },
    });
    controllerRef.current = controller;
    const onVisibilityChange = () => controller.setVisible(document.visibilityState === 'visible');
    controller.setVisible(document.visibilityState === 'visible');
    controller.start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mountedRef.current = false;
      controllerRef.current = null;
      controller.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [options.enabled, options.intervalMs]);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    try {
      await controllerRef.current?.forceRefresh();
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  return { count, isLoading, error, refresh };
}
