/**
 * Phase 3 frontend facet exports for `@appspine/notification/frontend` (PL3-08).
 */
export interface NotificationFrontendContribution {
  readonly kind: 'appspine.notification.frontend';
}

// Named re-exports, not `export * from`: see frontend/index.ts for why -- a `for...in`-based
// re-export silently drops anything backed by an RSC client-reference proxy.
export {
  createNotificationPollingController,
  NotificationBell,
  useNotificationPolling,
} from './frontend/index.js';
export type {
  NotificationBellProps,
  NotificationCountResult,
  NotificationDataSource,
  NotificationIconRenderer,
  NotificationLabels,
  NotificationListResult,
  NotificationPollingController,
  NotificationPollingOptions,
  NotificationPollingState,
  NotificationSeverity,
  NotificationSummary,
} from './frontend/index.js';
