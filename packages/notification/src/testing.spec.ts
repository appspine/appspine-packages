import { describe, expect, it } from 'vitest';

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
});
