import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { NOTIFICATION_LIMITS } from './constants';
import { NotificationService } from './notification.service';
import { createMockNotificationTx } from './testing';

const input = {
  recipientUserId: 'user-1',
  idempotencyKey: 'issue:1:user-1',
  type: 'project.issue.assigned',
  title: 'Assigned to PROJ-1',
  sourceApp: 'project',
  targetPath: '/dashboard/projects/project-1/issues/issue-1',
};

describe('NotificationService', () => {
  it('is first-write-wins for duplicate idempotency keys', async () => {
    const { tx, state } = createMockNotificationTx();
    const service = new NotificationService({ notification: tx.notification } as never);

    const first = await service.notify(input, { tx: tx as never });
    const second = await service.notify({ ...input, title: 'Changed title' }, { tx: tx as never });

    expect(second.id).toBe(first.id);
    expect(second.title).toBe('Assigned to PROJ-1');
    expect(state.rows).toHaveLength(1);
  });

  it('preserves batch input order and deduplicates within a batch', async () => {
    const { tx } = createMockNotificationTx();
    const service = new NotificationService({ notification: tx.notification } as never);

    const rows = await service.notifyMany(
      [input, { ...input, recipientUserId: 'user-2' }, { ...input, title: 'ignored' }],
      { tx: tx as never },
    );

    expect(rows.map((row) => row.recipientUserId)).toEqual(['user-1', 'user-2', 'user-1']);
    expect(rows[0].title).toBe(rows[2].title);
  });

  it('filters archived rows and unread count by recipient', async () => {
    const { tx } = createMockNotificationTx();
    const service = new NotificationService({ notification: tx.notification } as never);

    const row = await service.notify(input, { tx: tx as never });
    await service.notify(
      { ...input, recipientUserId: 'user-2', idempotencyKey: 'other' },
      { tx: tx as never },
    );
    await service.archive(row.id, 'user-1');

    await expect(service.getInbox('user-1')).resolves.toMatchObject({ data: [], total: 0 });
    await expect(service.getUnreadCount('user-1')).resolves.toEqual({ count: 0 });
    await expect(service.getUnreadCount('user-2')).resolves.toEqual({ count: 1 });
  });

  it('uses ownership-bound mutations and hides cross-user rows', async () => {
    const { tx } = createMockNotificationTx();
    const service = new NotificationService({ notification: tx.notification } as never);
    const row = await service.notify(input, { tx: tx as never });

    await expect(service.markRead(row.id, 'other-user')).rejects.toThrow('Notification not found');
    await expect(service.markRead(row.id, 'user-1')).resolves.toMatchObject({
      readAt: expect.any(Date),
    });
    await expect(service.markAllRead('user-1')).resolves.toEqual({ count: 0 });
  });

  describe('transaction isolation', () => {
    // Two distinct stores stand in for "the injected PrismaService" and "the caller's tx" — a
    // shared store between the two can't tell whether options.tx was actually honored.
    function createIsolatedService() {
      const primary = createMockNotificationTx();
      const tx = createMockNotificationTx();
      const service = new NotificationService(primary.tx as never);
      return { service, primary, tx };
    }

    it('notify()/notifyMany() write only to the caller-provided tx store', async () => {
      const { service, primary, tx } = createIsolatedService();

      const row = await service.notify(input, { tx: tx.tx as never });
      await service.notifyMany([{ ...input, recipientUserId: 'user-2' }], { tx: tx.tx as never });

      expect(tx.state.rows).toHaveLength(2);
      expect(primary.state.rows).toHaveLength(0);
      expect(row.recipientUserId).toBe('user-1');
    });

    it('getInbox() and getUnreadCount() read from the caller-provided tx store, not the injected client', async () => {
      const { service, primary, tx } = createIsolatedService();
      await service.notify(input, { tx: tx.tx as never });

      await expect(service.getUnreadCount('user-1', { tx: tx.tx as never })).resolves.toEqual({
        count: 1,
      });
      await expect(service.getUnreadCount('user-1')).resolves.toEqual({ count: 0 });

      await expect(
        service.getInbox('user-1', undefined, { tx: tx.tx as never }),
      ).resolves.toMatchObject({ total: 1 });
      await expect(service.getInbox('user-1')).resolves.toMatchObject({ total: 0 });
      expect(primary.state.rows).toHaveLength(0);
    });

    it('markRead()/markAllRead()/archive() mutate only the caller-provided tx store', async () => {
      const { service, primary, tx } = createIsolatedService();
      const first = await service.notify(input, { tx: tx.tx as never });
      const second = await service.notify(
        { ...input, idempotencyKey: 'issue:2:user-1' },
        { tx: tx.tx as never },
      );

      // Without {tx}, the row is invisible to the injected client — this is the exact bug the
      // contract forbids: mutations silently escaping the caller's transaction boundary.
      await expect(service.markRead(first.id, 'user-1')).rejects.toThrow('Notification not found');

      await service.markRead(first.id, 'user-1', { tx: tx.tx as never });
      expect(tx.state.rows.find((row) => row.id === first.id)?.readAt).not.toBeNull();

      await service.markAllRead('user-1', { tx: tx.tx as never });
      expect(tx.state.rows.every((row) => row.readAt !== null)).toBe(true);

      await service.archive(second.id, 'user-1', { tx: tx.tx as never });
      expect(tx.state.rows.find((row) => row.id === second.id)?.archivedAt).not.toBeNull();

      expect(primary.state.rows).toHaveLength(0);
    });
  });

  describe('input validation', () => {
    it('rejects blank recipient/notification ids with a 400, not an unhandled 500', async () => {
      const { tx } = createMockNotificationTx();
      const service = new NotificationService(tx as never);

      await expect(service.getInbox('   ')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.markRead('id-1', '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an oversized recipient/notification id on read/mutate paths, not just on write', async () => {
      const { tx } = createMockNotificationTx();
      const service = new NotificationService(tx as never);
      const oversizedId = 'x'.repeat(NOTIFICATION_LIMITS.id + 1);

      await expect(service.getInbox(oversizedId)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.getUnreadCount(oversizedId)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.markRead(oversizedId, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.markRead('id-1', oversizedId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.markAllRead(oversizedId)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.archive('id-1', oversizedId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects out-of-range pagination with a 400 carrying structured issues', async () => {
      const { tx } = createMockNotificationTx();
      const service = new NotificationService(tx as never);

      await expect(service.getInbox('user-1', { page: -1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        service.getInbox('user-1', { limit: NOTIFICATION_LIMITS.limit + 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an oversized notifyMany batch instead of letting it hit Postgres param limits', async () => {
      const { tx } = createMockNotificationTx();
      const service = new NotificationService(tx as never);
      const oversized = Array.from({ length: NOTIFICATION_LIMITS.notifyManyBatch + 1 }, (_, i) => ({
        ...input,
        idempotencyKey: `issue:${i}:user-1`,
      }));

      await expect(service.notifyMany(oversized)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
