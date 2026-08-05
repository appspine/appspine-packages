import { PrismaService } from '@appspine/common';
import { Injectable, NotFoundException } from '@nestjs/common';

import { DEFAULT_NOTIFICATION_LIMIT, DEFAULT_NOTIFICATION_PAGE } from './constants';
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
import { createNotificationSchema, notificationQuerySchema } from './validation';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(
    input: CreateNotificationInput,
    options?: NotificationServiceOptions,
  ): Promise<NotificationRecord> {
    const validated = createNotificationSchema.parse(input);
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
    const validated = inputs.map((input) => createNotificationSchema.parse(input));
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

  async getInbox(recipientUserId: string, query?: NotificationQuery): Promise<NotificationPage> {
    const owner = validateRecipient(recipientUserId);
    const { page, limit } = notificationQuerySchema.parse({
      page: query?.page ?? DEFAULT_NOTIFICATION_PAGE,
      limit: query?.limit ?? DEFAULT_NOTIFICATION_LIMIT,
    });
    const where = { recipientUserId: owner, archivedAt: null } as const;
    const delegate = this.delegate();
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

  async getUnreadCount(recipientUserId: string): Promise<{ count: number }> {
    const owner = validateRecipient(recipientUserId);
    const count = await this.delegate().count({
      where: { recipientUserId: owner, readAt: null, archivedAt: null },
    });
    return { count };
  }

  async markRead(notificationId: string, recipientUserId: string): Promise<NotificationRecord> {
    const id = validateRecipient(notificationId);
    const owner = validateRecipient(recipientUserId);
    const delegate = this.delegate();
    await delegate.updateMany({
      where: { id, recipientUserId: owner, readAt: null },
      data: { readAt: new Date() },
    });
    return this.findOwnedOrThrow(delegate, id, owner);
  }

  async markAllRead(recipientUserId: string): Promise<{ count: number }> {
    const owner = validateRecipient(recipientUserId);
    return this.delegate().updateMany({
      where: { recipientUserId: owner, readAt: null, archivedAt: null },
      data: { readAt: new Date() },
    });
  }

  async archive(notificationId: string, recipientUserId: string): Promise<NotificationRecord> {
    const id = validateRecipient(notificationId);
    const owner = validateRecipient(recipientUserId);
    const delegate = this.delegate();
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

function toCreateData(input: CreateNotificationInput): NotificationCreateData {
  const parsed = createNotificationSchema.parse(input);
  return {
    recipientUserId: parsed.recipientUserId,
    idempotencyKey: parsed.idempotencyKey,
    type: parsed.type,
    category: parsed.category ?? null,
    severity: parsed.severity,
    title: parsed.title,
    body: parsed.body ?? null,
    sourceApp: parsed.sourceApp,
    sourceEventId: parsed.sourceEventId ?? null,
    sourceEntityType: parsed.sourceEntityType ?? null,
    sourceEntityId: parsed.sourceEntityId ?? null,
    targetPath: parsed.targetPath ?? null,
  };
}

function validateRecipient(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0)
    throw new Error('Notification id and recipientUserId must be non-empty');
  return trimmed;
}

function notificationKey(recipientUserId: string, idempotencyKey: string): string {
  return `${recipientUserId}\u0000${idempotencyKey}`;
}
