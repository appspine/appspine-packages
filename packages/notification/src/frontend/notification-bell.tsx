'use client';

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  cn,
} from '@appspine/frontend-shell';
import { Bell, CircleCheck, Info, OctagonAlert, RefreshCw, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import type {
  NotificationBellProps,
  NotificationSummary,
} from './types.js';
import { useNotificationPolling } from './use-notification-polling.js';

type RecentState = {
  items: NotificationSummary[];
  loading: boolean;
  error: unknown;
};

const EMPTY_RECENT: RecentState = { items: [], loading: false, error: null };
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
      await loadRecent();
    } catch {
      setOptimisticItems(previous);
      setActionError(labels.markAllReadError);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (
    notification: NotificationSummary,
    event: React.MouseEvent,
  ) => {
    const href = dataSource.resolveHref(notification);
    if (notification.readAt) {
      if (href) {
        event.preventDefault();
        window.location.assign(href);
      }
      return;
    }
    const previous = displayItems;
    setOptimisticItems(
      previous.map((item) =>
        item.id === notification.id ? { ...item, readAt: new Date() } : item,
      ),
    );
    setActionError(null);
    try {
      await Promise.race([
        dataSource.markRead(notification.id),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), MARK_READ_TIMEOUT_MS),
        ),
      ]);
      void refreshCount();
      if (href) {
        event.preventDefault();
        window.location.assign(href);
      }
    } catch {
      setOptimisticItems(previous);
      setActionError(labels.markReadError);
      if (href) {
        event.preventDefault();
        window.location.assign(href);
      }
    }
  };

  const renderIcon = (notification: NotificationSummary) => {
    if (renderTypeIcon) {
      const custom = renderTypeIcon(notification);
      if (custom) return custom;
    }
    switch (notification.severity) {
      case 'critical':
        return <OctagonAlert className="size-4 text-destructive" />;
      case 'warning':
        return <TriangleAlert className="size-4 text-warning" />;
      case 'success':
        return <CircleCheck className="size-4 text-success" />;
      case 'info':
      default:
        return <Info className="size-4 text-muted-foreground" />;
    }
  };

  const formatTimestamp = (value: string | Date) => {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (labels.formatTimestamp) return labels.formatTimestamp(date);
    return date.toLocaleDateString();
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={labels.ariaLabel}
          className={cn('relative', className)}
        >
          <Bell className="size-5" />
          {displayCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
            >
              {displayCount > 99 ? '99+' : displayCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between border-b p-3">
          <span className="font-semibold text-sm">{labels.title}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={!canMarkAllRead || markingAll}
            onClick={handleMarkAllRead}
          >
            {markingAll ? labels.retrying : labels.markAllRead}
          </Button>
        </div>

        {actionError && (
          <div className="bg-destructive/10 px-3 py-2 text-destructive text-xs">
            {actionError}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto">
          {recent.loading && (
            <div className="space-y-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!recent.loading && Boolean(recent.error) && (
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="text-muted-foreground text-xs">{labels.error}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void loadRecent()}
              >
                <RefreshCw className="mr-1 size-3" />
                {labels.retry}
              </Button>
            </div>
          )}

          {!recent.loading && !recent.error && displayItems.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-xs">{labels.empty}</div>
          )}

          {!recent.loading &&
            !recent.error &&
            displayItems.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 p-3',
                  !item.readAt && 'bg-muted/40 font-medium',
                )}
                onClick={(event) => void handleNotificationClick(item, event)}
              >
                <div className="mt-0.5">{renderIcon(item)}</div>
                <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  <span className="truncate text-xs">{item.title}</span>
                  {item.body && (
                    <span className="truncate text-muted-foreground text-xs">{item.body}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {formatTimestamp(item.createdAt)}
                  </span>
                </div>
                {!item.readAt && <span className="size-1.5 rounded-full bg-primary" />}
              </DropdownMenuItem>
            ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
