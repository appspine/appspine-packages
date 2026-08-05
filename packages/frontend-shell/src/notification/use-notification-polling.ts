import { useCallback, useEffect, useRef, useState } from 'react';

export type NotificationCountResult = number | { count: number };

export type NotificationPollingController = {
  /**
   * Opportunistic refresh used by the interval timer and visibility changes: coalesces into
   * whatever request is already in flight rather than issuing a duplicate, since the background
   * poll has no urgency requirement — eventual consistency is fine.
   */
  refresh: () => Promise<void>;
  /**
   * Always issues a fresh request, bumping the sequence so any older in-flight response (from a
   * concurrent `refresh()` or a prior `forceRefresh()`) is ignored when it lands. Use this after a
   * mutation (mark-read, mark-all-read) where the caller specifically needs the server's current
   * count, not whatever an in-progress background poll happens to return.
   */
  forceRefresh: () => Promise<void>;
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
        // Only the request that is still current clears `inFlight` — an older request's finally
        // firing after a newer one started must not wipe out the newer request's in-flight marker.
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
  // The controller owns the in-flight/sequence guards; `refresh()` below delegates to
  // `forceRefresh()` instead of re-implementing its own fetch, so a manual refresh (e.g. after
  // mark-read) always reflects the mutation rather than piggybacking on — and resolving with the
  // stale result of — a concurrent background poll that started before the mutation landed.
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
      // Always clears isLoading — even if the controller no-op'd (unmounted/not yet started) or
      // its onCount/onError callback never fires — so a bare setIsLoading(true) with no matching
      // controller-driven reset can't latch the bell in a permanently "busy" state.
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  return { count, isLoading, error, refresh };
}
