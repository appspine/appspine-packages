import type {
  NotificationCreateData,
  NotificationOrderBy,
  NotificationRecord,
  NotificationUniqueWhere,
  NotificationUpdateData,
  NotificationWhere,
} from './types';

export type MockNotificationState = {
  rows: NotificationRecord[];
};

/**
 * Creates an isolated mock notification store. Tests that need to prove a caller-provided `tx`
 * is actually used (rather than the service silently falling back to its injected client) must
 * call this twice and pass one store as the constructor's `PrismaService` and the other as
 * `options.tx` — a single shared store makes that distinction unobservable.
 */
export function createMockNotificationTx(initialRows: NotificationRecord[] = []) {
  const state: MockNotificationState = { rows: [...initialRows] };
  const tx = createDelegate(state);
  return { state, tx: { notification: tx } };
}

function createDelegate(state: MockNotificationState) {
  return {
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: NotificationCreateData[];
      skipDuplicates?: boolean;
    }) => {
      let count = 0;
      for (const item of data) {
        const duplicate = state.rows.some(
          (row) =>
            row.recipientUserId === item.recipientUserId &&
            row.idempotencyKey === item.idempotencyKey,
        );
        if (duplicate && skipDuplicates) continue;
        if (duplicate) throw new Error('duplicate notification');
        const now = new Date();
        state.rows.push({
          id: `notification-${state.rows.length + 1}`,
          ...item,
          readAt: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        count++;
      }
      return { count };
    },
    findUnique: async ({ where }: { where: NotificationUniqueWhere }) =>
      state.rows.find((row) => matchesUnique(row, where)) ?? null,
    findMany: async ({
      where,
      skip,
      take,
      orderBy,
    }: {
      where?: NotificationWhere;
      skip?: number;
      take?: number;
      orderBy?: NotificationOrderBy[];
    }) => {
      const rows = state.rows.filter((row) => matchesWhere(row, where));
      if (orderBy) {
        rows.sort((left, right) => {
          const created = right.createdAt.getTime() - left.createdAt.getTime();
          return created === 0 ? right.id.localeCompare(left.id) : created;
        });
      }
      return rows.slice(skip ?? 0, take === undefined ? undefined : (skip ?? 0) + take);
    },
    findFirst: async ({ where }: { where: NotificationWhere }) =>
      state.rows.find((row) => matchesWhere(row, where)) ?? null,
    count: async ({ where }: { where: NotificationWhere }) =>
      state.rows.filter((row) => matchesWhere(row, where)).length,
    updateMany: async ({
      where,
      data,
    }: {
      where: NotificationWhere;
      data: NotificationUpdateData;
    }) => {
      const rows = state.rows.filter((row) => matchesWhere(row, where));
      for (const row of rows) Object.assign(row, data, { updatedAt: new Date() });
      return { count: rows.length };
    },
  };
}

function matchesUnique(row: NotificationRecord, where: NotificationUniqueWhere): boolean {
  if (where.id) return row.id === where.id;
  const pair = where.recipientUserId_idempotencyKey;
  return pair
    ? row.recipientUserId === pair.recipientUserId && row.idempotencyKey === pair.idempotencyKey
    : false;
}

function matchesWhere(row: NotificationRecord, where: NotificationWhere | undefined): boolean {
  if (!where) return true;
  if (where.OR && !where.OR.some((candidate) => matchesWhere(row, candidate))) return false;
  if (where.id && row.id !== where.id) return false;
  if (where.recipientUserId && row.recipientUserId !== where.recipientUserId) return false;
  if (where.idempotencyKey && row.idempotencyKey !== where.idempotencyKey) return false;
  if (where.archivedAt === null && row.archivedAt !== null) return false;
  if (where.archivedAt instanceof Date && row.archivedAt?.getTime() !== where.archivedAt.getTime())
    return false;
  if (where.readAt === null && row.readAt !== null) return false;
  if (where.readAt instanceof Date && row.readAt?.getTime() !== where.readAt.getTime())
    return false;
  return true;
}
