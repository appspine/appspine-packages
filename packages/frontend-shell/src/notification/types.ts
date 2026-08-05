import type { ReactNode } from 'react';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export type NotificationSummary = {
  id: string;
  type: string;
  category?: string | null;
  severity: NotificationSeverity;
  title: string;
  body?: string | null;
  createdAt: string | Date;
  readAt?: string | Date | null;
  archivedAt?: string | Date | null;
  targetPath?: string | null;
};

export type NotificationListResult =
  | NotificationSummary[]
  | {
      data: NotificationSummary[];
      total?: number;
    };

export type NotificationDataSource = {
  loadUnreadCount: () => Promise<number | { count: number }>;
  loadRecent: () => Promise<NotificationListResult>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  resolveHref: (notification: NotificationSummary) => string | null;
};

export type NotificationLabels = {
  ariaLabel: string;
  title: string;
  markAllRead: string;
  markAllReadError: string;
  markReadError: string;
  loading: string;
  empty: string;
  error: string;
  retry: string;
  unread: string;
  read: string;
  retrying: string;
  formatTimestamp?: (value: Date) => string;
};

export type NotificationIconRenderer = (notification: NotificationSummary) => ReactNode;
