'use client';

import { Bell, CircleCheck, Info, OctagonAlert, RefreshCw, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js';
import { Skeleton } from '../components/ui/skeleton.js';
import { cn } from '../lib/utils.js';
import type {
  NotificationDataSource,
  NotificationIconRenderer,
  NotificationLabels,
  NotificationSummary,
} from './types.js';
import { useNotificationPolling } from './use-notification-polling.js';

export type NotificationBellProps = {
  dataSource: NotificationDataSource;
  labels: NotificationLabels;
  initialUnreadCount?: number;
  pollIntervalMs?: number;
  maxItems?: number;
  className?: string;
  renderTypeIcon?: NotificationIconRenderer;
};

type RecentState = {
  items: NotificationSummary[];
  loading: boolean;
  error: unknown;
};

const EMPTY_RECENT: RecentState = { items: [], loading: false, error: null };
// Bounds how long a click's deferred navigation waits on markRead before proceeding anyway — a
// hung/slow request must not turn a notification into a permanently unclickable dead link.
const MARK_READ_TIMEOUT_MS = 1500;

export function NotificationBell({
  dataSource,
  labels,
  initialUnreadCount,
  pollIntervalMs,
  maxItems = 10,
  className,
  renderTypeIcon,
}: NotificationBellProps) {
  const [open, setOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<RecentState>(EMPTY_RECENT);
  const [markingAll, setMarkingAll] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [optimisticItems, setOptimisticItems] = React.useState<NotificationSummary[] | null>(null);
  const {
    count,
    isLoading: countLoading,
    error: pollingError,
    refresh: refreshCount,
  } = useNotificationPolling({
    loadUnreadCount: dataSource.loadUnreadCount,
    initialUnreadCount,
    intervalMs: pollIntervalMs,
  });
  const displayItems = optimisticItems ?? recent.items;
  const displayCount = Math.max(0, count);
  // If the unread-count poll is failing, `count` is stale/unusable, so fall back to the recent
  // list (which loads independently) to decide whether "mark all read" should be actionable —
  // otherwise a persistent polling failure permanently disables it with no way to recover.
  const hasUnreadItems = displayItems.some((item) => !item.readAt);
  const canMarkAllRead = pollingError ? hasUnreadItems : displayCount > 0;

  const loadRecent = React.useCallback(async () => {
    setRecent((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const result = await dataSource.loadRecent();
      const items = Array.isArray(result) ? result : result.data;
      setRecent({ items: items.slice(0, maxItems), loading: false, error: null });
      setOptimisticItems(null);
    } catch (error) {
      setRecent((previous) => ({ ...previous, loading: false, error }));
    }
  }, [dataSource.loadRecent, maxItems]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) void loadRecent();
  };

  const handleMarkAllRead = async () => {
    if (markingAll || !canMarkAllRead) return;
    const previous = displayItems;
    setMarkingAll(true);
    setActionError(null);
    setOptimisticItems(previous.map((item) => ({ ...item, readAt: item.readAt ?? new Date() })));
    try {
      await dataSource.markAllRead();
      await refreshCount();
    } catch {
      setOptimisticItems(previous);
      setActionError(labels.markAllReadError);
    } finally {
      setMarkingAll(false);
    }
  };

  // `navigateHref`, when present, is followed only after the mark-read attempt settles or times
  // out — the caller has already preventDefault()-ed the native anchor navigation so a full-page
  // unload can't abort the in-flight markRead request out from under it, and a hung/slow request
  // can't turn the notification into a permanently unclickable dead link either.
  const handleSelect = async (notification: NotificationSummary, navigateHref?: string) => {
    if (!notification.readAt) {
      const previous = displayItems;
      const next = previous.map((item) =>
        item.id === notification.id ? { ...item, readAt: new Date() } : item,
      );
      setOptimisticItems(next);

      const markReadSettled: Promise<'ok' | 'failed'> = dataSource.markRead(notification.id).then(
        () => 'ok',
        () => 'failed',
      );
      const reconcile = (outcome: 'ok' | 'failed') => {
        if (outcome === 'failed') {
          // Functional update: only roll back if this is still the optimistic state we set —
          // a newer action in the meantime (e.g. marking a different item read) must not be
          // clobbered by a late-arriving reconciliation from this one.
          setOptimisticItems((current) => (current === next ? previous : current));
          setActionError(labels.markReadError);
        } else if (!navigateHref) {
          // Refreshing the count is pointless when we're about to navigate away — the result
          // will never be seen before unload.
          void refreshCount();
        }
      };

      const timedOut = new Promise<'timed-out'>((resolve) => {
        setTimeout(() => resolve('timed-out'), MARK_READ_TIMEOUT_MS);
      });
      const outcome = await Promise.race([markReadSettled, timedOut]);
      if (outcome === 'timed-out') {
        // Stop waiting so navigation below can proceed, but keep reconciling in the background —
        // a same-page click (no navigateHref) still needs the eventual real outcome applied.
        void markReadSettled.then(reconcile);
      } else {
        reconcile(outcome);
      }
    }
    if (navigateHref) window.location.href = navigateHref;
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          aria-label={labels.ariaLabel}
          aria-busy={countLoading}
          className={cn('relative', className)}
        >
          <Bell aria-hidden="true" />
          {displayCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]"
              aria-label={`${displayCount} ${labels.unread}`}
            >
              {displayCount > 99 ? '99+' : displayCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-1rem))] p-2.5">
        <div className="flex items-center justify-between gap-2 px-1.5 py-1">
          <span className="font-medium text-sm">{labels.title}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto min-h-7 shrink-0 px-2 text-xs"
            disabled={markingAll || !canMarkAllRead}
            onClick={() => void handleMarkAllRead()}
          >
            {markingAll ? labels.retrying : labels.markAllRead}
          </Button>
        </div>
        {Boolean(pollingError) && (
          <div className="mx-1 mb-1 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive text-xs">
            <span role="status">{labels.error}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void refreshCount()}
              aria-label={labels.retry}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          </div>
        )}
        {actionError && (
          <div className="mx-1 mb-1 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive text-xs">
            <span role="status">{actionError}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setActionError(null)}
              aria-label={labels.retry}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          </div>
        )}
        {recent.loading && displayItems.length === 0 ? (
          <NotificationSkeleton label={labels.loading} />
        ) : recent.error && displayItems.length === 0 ? (
          <NotificationError labels={labels} onRetry={() => void loadRecent()} />
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground text-sm">
            <Bell className="size-5" aria-hidden="true" />
            <span>{labels.empty}</span>
          </div>
        ) : (
          <div className="max-h-[min(28rem,calc(100vh-8rem))] overflow-y-auto">
            {Boolean(recent.error) && (
              <div
                className="mx-1 mb-1 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive text-xs"
                role="status"
              >
                {labels.error}
              </div>
            )}
            {displayItems.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                labels={labels}
                href={dataSource.resolveHref(notification)}
                renderTypeIcon={renderTypeIcon}
                onSelect={(navigateHref) => void handleSelect(notification, navigateHref)}
              />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationItem({
  notification,
  labels,
  href,
  renderTypeIcon,
  onSelect,
}: {
  notification: NotificationSummary;
  labels: NotificationLabels;
  href: string | null;
  renderTypeIcon?: NotificationIconRenderer;
  onSelect: (navigateHref?: string) => void;
}) {
  const read = Boolean(notification.readAt);
  const timestamp =
    notification.createdAt instanceof Date
      ? notification.createdAt
      : new Date(notification.createdAt);
  const formatted =
    labels.formatTimestamp?.(timestamp) ??
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp);
  const content = (
    <div className="flex min-w-0 items-start gap-2 py-1">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {renderTypeIcon?.(notification) ?? <SeverityIcon severity={notification.severity} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className={cn('min-w-0 flex-1 break-words', !read && 'font-medium')}>
            {notification.title}
          </span>
          <span className="mt-1 shrink-0">
            <span className="sr-only">{read ? labels.read : labels.unread}</span>
            <span
              aria-hidden="true"
              className={cn(
                'block size-2 rounded-full',
                read ? 'bg-muted-foreground/30' : 'bg-primary',
              )}
            />
          </span>
        </span>
        {notification.body && (
          <span className="mt-0.5 block max-h-10 overflow-hidden break-words text-muted-foreground text-xs">
            {notification.body}
          </span>
        )}
        <time
          dateTime={timestamp.toISOString()}
          title={timestamp.toISOString()}
          className="mt-1 block text-muted-foreground text-xs"
        >
          {formatted}
        </time>
      </span>
    </div>
  );

  // A plain left click would otherwise start the browser's full-page navigation immediately,
  // aborting the in-flight markRead fetch before it lands. Deferring navigation until after
  // handleSelect settles keeps the notification's read state from being silently lost. Modifier
  // clicks (new tab/window) and middle-click leave the current page alive, so the native anchor
  // behavior is left untouched for those.
  //
  // The click event `handleAnchorClick` receives is NOT reliable for reading modifier keys: Radix
  // menu items re-dispatch a synthetic `element.click()` from their own pointerup handler (so the
  // press-on-trigger/release-on-item drag gesture still counts as a selection), and that
  // synthetic click always reports `button: 0` with no modifier keys regardless of what was
  // actually held. So the real gesture is captured on pointerdown instead — the earliest event
  // that still reflects genuine input — and consumed exactly once per click.
  const pointerModifiersRef = React.useRef<{
    button: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLAnchorElement>) => {
    pointerModifiersRef.current = {
      button: event.button,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    };
  };

  const handleAnchorClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Falls back to a plain-click reading when there's no captured pointerdown (keyboard
    // activation via Enter/Space never fires one) — keyboard users get the deferred-navigation
    // path, matching how a plain left click behaves.
    const modifiers = pointerModifiersRef.current ?? {
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    };
    pointerModifiersRef.current = null;
    const isPlainLeftClick =
      modifiers.button === 0 &&
      !modifiers.metaKey &&
      !modifiers.ctrlKey &&
      !modifiers.shiftKey &&
      !modifiers.altKey;
    if (!isPlainLeftClick) {
      onSelect();
      return;
    }
    event.preventDefault();
    onSelect(href ?? undefined);
  };

  // Middle-click opens a new tab/window via the browser's native handling and never fires a
  // `click` event at all (only `auxclick`) — still mark the notification read for that gesture,
  // without touching navigation.
  const handleAuxClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button === 1) onSelect();
  };

  return (
    <DropdownMenuItem asChild className="min-h-14 cursor-pointer items-start whitespace-normal">
      {href ? (
        <a
          href={href}
          onPointerDown={handlePointerDown}
          onClick={handleAnchorClick}
          onAuxClick={handleAuxClick}
        >
          {content}
        </a>
      ) : (
        <button type="button" onClick={() => onSelect()} className="w-full text-left">
          {content}
        </button>
      )}
    </DropdownMenuItem>
  );
}

function SeverityIcon({ severity }: { severity: NotificationSummary['severity'] }) {
  if (severity === 'success') return <CircleCheck className="size-4 text-primary" />;
  if (severity === 'warning') return <TriangleAlert className="size-4 text-foreground" />;
  if (severity === 'critical') return <OctagonAlert className="size-4 text-destructive" />;
  return <Info className="size-4 text-muted-foreground" />;
}

function NotificationSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2 px-2 py-3" aria-label={label} role="status">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex gap-2 py-2">
          <Skeleton className="mt-1 size-4 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationError({
  labels,
  onRetry,
}: {
  labels: NotificationLabels;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-3 py-6 text-center text-destructive text-sm"
      role="alert"
    >
      <TriangleAlert className="size-5" aria-hidden="true" />
      <span>{labels.error}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        {labels.retry}
      </Button>
    </div>
  );
}
