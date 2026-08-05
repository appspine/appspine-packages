import { useCallback, useEffect, useRef, useState } from 'react';

export type NotificationCountResult = number | { count: number };

export type NotificationPollingController = {
  refresh: () => Promise<void>;
  start: () => void;
  stop: () => void;
  setVisible: (visible: boolean) => void;
};

export type NotificationPollingOptions = {
  loadUnreadCount: () => Promise<NotificationCountResult>;
  initialUnreadCount?: number;
  intervalMs?: number;
  enabled?: boolean;
  onCount?: (count: number) => void;
  onError?: (error: unknown) => void;
};

export type NotificationPollingState = {
  count: number;
  isLoading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
};

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Creates the timer/request coordinator used by the hook. Keeping this small controller separate
 * makes visibility, cleanup, overlap and stale-response behavior testable without a browser app.
 */
export function createNotificationPollingController(
  options: NotificationPollingOptions,
): NotificationPollingController {
  const intervalMs = Math.max(1000, options.intervalMs ?? DEFAULT_INTERVAL_MS);
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> | undefined;
  let visible = true;
  let active = false;
  let requestSequence = 0;

  const refresh = async () => {
    if (!active || !visible || inFlight) return inFlight;
    const sequence = ++requestSequence;
    inFlight = Promise.resolve()
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
        inFlight = undefined;
      });
    return inFlight;
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

  return { refresh, start, stop, setVisible };
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

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    try {
      const result = await loadUnreadCountRef.current();
      if (!mountedRef.current) return;
      const next = typeof result === 'number' ? result : result.count;
      setCount(Math.max(0, Number.isFinite(next) ? next : 0));
      setError(null);
    } catch (nextError) {
      if (!mountedRef.current) return;
      setError(nextError);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

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
    const onVisibilityChange = () => controller.setVisible(document.visibilityState === 'visible');
    controller.start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mountedRef.current = false;
      controller.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [options.enabled, options.intervalMs]);

  return { count, isLoading, error, refresh };
}
