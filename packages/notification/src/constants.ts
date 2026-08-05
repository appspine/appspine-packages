export const NOTIFICATION_LIMITS = {
  id: 128,
  idempotencyKey: 255,
  type: 128,
  category: 128,
  title: 512,
  body: 4000,
  sourceApp: 128,
  sourceEventId: 128,
  sourceEntityType: 128,
  sourceEntityId: 128,
  targetPath: 1024,
  page: 1000000,
  limit: 100,
  /**
   * createMany binds ~12 params/row and the idempotency read-back binds 2 params/row via an OR
   * clause; 1000 keeps both well under Postgres's 65535 bound-parameter limit.
   */
  notifyManyBatch: 1000,
} as const;

export const DEFAULT_NOTIFICATION_PAGE = 1;
export const DEFAULT_NOTIFICATION_LIMIT = 20;

export const NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'critical'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];
