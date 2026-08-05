import { PrismaService } from '@appspine/common';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ZodType } from 'zod';

import {
  DEFAULT_NOTIFICATION_LIMIT,
  DEFAULT_NOTIFICATION_PAGE,
  NOTIFICATION_LIMITS,
} from './constants';
import type {
  CreateNotificationInput,
  NotificationCreateData,
  NotificationDelegate,
  NotificationPage,
  NotificationQuery,
  NotificationRecord,
  NotificationServiceOptions,
  NotificationTxClient,
} from './types';
import {
  createNotificationSchema,
  notificationQuerySchema,
  type ValidatedCreateNotificationInput,
} from './validation';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(
    input: CreateNotificationInput,
    options?: NotificationServiceOptions,
  ): Promise<NotificationRecord> {
    const validated = parseOrThrow(createNotificationSchema, input);
    const delegate = this.delegate(options?.tx);
    const data = toCreateData(validated);

    await delegate.createMany({ data: [data], skipDuplicates: true });
    const row = await delegate.findUnique({
      where: {
        recipientUserId_idempotencyKey: {
          recipientUserId: data.recipientUserId,
          idempotencyKey: data.idempotencyKey,
        },
      },
    });
    if (!row) throw new Error('Notification insert succeeded but the row could not be read back');
    return row;
  }

  async notifyMany(
    inputs: CreateNotificationInput[],
    options?: NotificationServiceOptions,
  ): Promise<NotificationRecord[]> {
    if (inputs.length > NOTIFICATION_LIMITS.notifyManyBatch) {
      throw new BadRequestException(
        `notifyMany accepts at most ${NOTIFICATION_LIMITS.notifyManyBatch} inputs per call, received ${inputs.length}`,
      );
    }
    const validated = inputs.map((input) => parseOrThrow(createNotificationSchema, input));
    if (validated.length === 0) return [];

    const delegate = this.delegate(options?.tx);
    const data = validated.map(toCreateData);
    await delegate.createMany({ data, skipDuplicates: true });

    const rows = await delegate.findMany({
      where: {
        OR: data.map((item) => ({
          recipientUserId: item.recipientUserId,
          idempotencyKey: item.idempotencyKey,
        })),
      },
    });
    const byKey = new Map(
      rows.map((row) => [notificationKey(row.recipientUserId, row.idempotencyKey), row]),
    );
    return data.map((item) => {
      const row = byKey.get(notificationKey(item.recipientUserId, item.idempotencyKey));
      if (!row)
        throw new Error('Notification batch insert succeeded but a row could not be read back');
      return row;
    });
  }

  async getInbox(
    recipientUserId: string,
    query?: NotificationQuery,
    options?: NotificationServiceOptions,
  ): Promise<NotificationPage> {
    const owner = validateRecipient(recipientUserId);
    const { page, limit } = parseOrThrow(notificationQuerySchema, {
      page: query?.page ?? DEFAULT_NOTIFICATION_PAGE,
      limit: query?.limit ?? DEFAULT_NOTIFICATION_LIMIT,
    });
    const where = { recipientUserId: owner, archivedAt: null } as const;
    const delegate = this.delegate(options?.tx);
    const [data, total] = await Promise.all([
      delegate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      delegate.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getUnreadCount(
    recipientUserId: string,
    options?: NotificationServiceOptions,
  ): Promise<{ count: number }> {
    const owner = validateRecipient(recipientUserId);
    const count = await this.delegate(options?.tx).count({
      where: { recipientUserId: owner, readAt: null, archivedAt: null },
    });
    return { count };
  }

  async markRead(
    notificationId: string,
    recipientUserId: string,
    options?: NotificationServiceOptions,
  ): Promise<NotificationRecord> {
    const id = validateRecipient(notificationId);
    const owner = validateRecipient(recipientUserId);
    const delegate = this.delegate(options?.tx);
    await delegate.updateMany({
      where: { id, recipientUserId: owner, readAt: null },
      data: { readAt: new Date() },
    });
    return this.findOwnedOrThrow(delegate, id, owner);
  }

  async markAllRead(
    recipientUserId: string,
    options?: NotificationServiceOptions,
  ): Promise<{ count: number }> {
    const owner = validateRecipient(recipientUserId);
    return this.delegate(options?.tx).updateMany({
      where: { recipientUserId: owner, readAt: null, archivedAt: null },
      data: { readAt: new Date() },
    });
  }

  async archive(
    notificationId: string,
    recipientUserId: string,
    options?: NotificationServiceOptions,
  ): Promise<NotificationRecord> {
    const id = validateRecipient(notificationId);
    const owner = validateRecipient(recipientUserId);
    const delegate = this.delegate(options?.tx);
    await delegate.updateMany({
      where: { id, recipientUserId: owner, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return this.findOwnedOrThrow(delegate, id, owner);
  }

  private delegate(tx?: NotificationTxClient): NotificationDelegate {
    return tx?.notification ?? this.prisma.notification;
  }

  private async findOwnedOrThrow(
    delegate: NotificationDelegate,
    id: string,
    recipientUserId: string,
  ): Promise<NotificationRecord> {
    const row = await delegate.findFirst({ where: { id, recipientUserId } });
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }
}

function toCreateData(input: ValidatedCreateNotificationInput): NotificationCreateData {
  return {
    recipientUserId: input.recipientUserId,
    idempotencyKey: input.idempotencyKey,
    type: input.type,
    category: input.category ?? null,
    severity: input.severity,
    title: input.title,
    body: input.body ?? null,
    sourceApp: input.sourceApp,
    sourceEventId: input.sourceEventId ?? null,
    sourceEntityType: input.sourceEntityType ?? null,
    sourceEntityId: input.sourceEntityId ?? null,
    targetPath: input.targetPath ?? null,
  };
}

/** Mirrors ZodValidationPipe's convention so callers see a 400 with structured issues, not a 500. */
function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.issues);
  return result.data;
}

function validateRecipient(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0)
    throw new BadRequestException('Notification id and recipientUserId must be non-empty');
  return trimmed;
}

function notificationKey(recipientUserId: string, idempotencyKey: string): string {
  return `${recipientUserId}\u0000${idempotencyKey}`;
}
