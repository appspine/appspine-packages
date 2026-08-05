import type { NotificationSeverity } from './constants';

export type NotificationRecord = {
  id: string;
  recipientUserId: string;
  idempotencyKey: string;
  type: string;
  category: string | null;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  sourceApp: string;
  sourceEventId: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  targetPath: string | null;
  readAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateNotificationInput = {
  recipientUserId: string;
  idempotencyKey: string;
  type: string;
  category?: string | null;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  sourceApp: string;
  sourceEventId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  targetPath?: string | null;
};

export type NotificationQuery = {
  page?: number;
  limit?: number;
};

export type NotificationPage = {
  data: NotificationRecord[];
  total: number;
  page: number;
  limit: number;
};

/**
 * Structural shape implemented by a consumer's generated Prisma client.
 * The package intentionally does not import a generated client because every app owns its schema.
 */
export type NotificationDelegate = {
  createMany(args: {
    data: NotificationCreateData[];
    skipDuplicates?: boolean;
  }): Promise<{ count: number }>;
  findUnique(args: { where: NotificationUniqueWhere }): Promise<NotificationRecord | null>;
  findMany(args: {
    where?: NotificationWhere;
    skip?: number;
    take?: number;
    orderBy?: NotificationOrderBy[];
  }): Promise<NotificationRecord[]>;
  findFirst(args: { where: NotificationWhere }): Promise<NotificationRecord | null>;
  count(args: { where: NotificationWhere }): Promise<number>;
  updateMany(args: {
    where: NotificationWhere;
    data: NotificationUpdateData;
  }): Promise<{ count: number }>;
};

export type NotificationTxClient = {
  notification: NotificationDelegate;
};

export type NotificationCreateData = {
  recipientUserId: string;
  idempotencyKey: string;
  type: string;
  category: string | null;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  sourceApp: string;
  sourceEventId: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  targetPath: string | null;
};

export type NotificationUniqueWhere = {
  id?: string;
  recipientUserId_idempotencyKey?: { recipientUserId: string; idempotencyKey: string };
};

export type NotificationWhere = {
  id?: string;
  recipientUserId?: string;
  idempotencyKey?: string;
  archivedAt?: Date | null;
  readAt?: Date | null;
  OR?: NotificationWhere[];
};

export type NotificationUpdateData = {
  readAt?: Date;
  archivedAt?: Date;
};

export type NotificationOrderBy = { createdAt: 'asc' | 'desc' } | { id: 'asc' | 'desc' };

export type NotificationServiceOptions = {
  tx?: NotificationTxClient;
};
