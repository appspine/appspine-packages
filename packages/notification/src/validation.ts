import { z } from 'zod';

import {
  DEFAULT_NOTIFICATION_LIMIT,
  DEFAULT_NOTIFICATION_PAGE,
  NOTIFICATION_LIMITS,
  NOTIFICATION_SEVERITIES,
} from './constants';
import type { CreateNotificationInput, NotificationQuery } from './types';

const boundedId = z.string().trim().min(1).max(NOTIFICATION_LIMITS.id);
const boundedType = z.string().trim().min(1).max(NOTIFICATION_LIMITS.type);
const nullableBounded = (max: number) => z.string().max(max).nullable().optional();

export const targetPathSchema = z
  .string()
  .max(NOTIFICATION_LIMITS.targetPath)
  .refine((value) => value.startsWith('/') && !value.startsWith('//'), {
    message: 'targetPath must be an app-local path beginning with a single slash',
  })
  .refine((value) => !/^[a-z][a-z\d+.-]*:/i.test(value), {
    message: 'targetPath must not contain an external URL scheme',
  });

export const createNotificationSchema = z.object({
  recipientUserId: boundedId,
  idempotencyKey: z.string().trim().min(1).max(NOTIFICATION_LIMITS.idempotencyKey),
  type: boundedType,
  category: nullableBounded(NOTIFICATION_LIMITS.category),
  severity: z.enum(NOTIFICATION_SEVERITIES).default('info'),
  title: z.string().trim().min(1).max(NOTIFICATION_LIMITS.title),
  body: nullableBounded(NOTIFICATION_LIMITS.body),
  sourceApp: z.string().trim().min(1).max(NOTIFICATION_LIMITS.sourceApp),
  sourceEventId: nullableBounded(NOTIFICATION_LIMITS.sourceEventId),
  sourceEntityType: nullableBounded(NOTIFICATION_LIMITS.sourceEntityType),
  sourceEntityId: nullableBounded(NOTIFICATION_LIMITS.sourceEntityId),
  targetPath: z.union([targetPathSchema, z.null()]).optional(),
}) satisfies z.ZodType<CreateNotificationInput>;

export const notificationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_LIMITS.page)
    .default(DEFAULT_NOTIFICATION_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_LIMITS.limit)
    .default(DEFAULT_NOTIFICATION_LIMIT),
}) satisfies z.ZodType<Required<NotificationQuery>>;

export type ValidatedCreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type ValidatedNotificationQuery = z.infer<typeof notificationQuerySchema>;
