import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from './notification.service';
import { createMockNotificationTx } from './testing';

describe('recipient isolation', () => {
  let service: NotificationService;
  let mockTx: ReturnType<typeof createMockNotificationTx>;

  beforeEach(() => {
    mockTx = createMockNotificationTx();
    service = new NotificationService(
      mockTx.tx as unknown as import('@appspine/common').PrismaService,
    );
  });

  it('strictly isolates inbox queries between users', async () => {
    await service.notify({
      recipientUserId: 'usr_alice',
      idempotencyKey: 'alice_1',
      type: 'user.alert',
      title: 'Alice Alert 1',
      sourceApp: 'app-main',
    });
    await service.notify({
      recipientUserId: 'usr_alice',
      idempotencyKey: 'alice_2',
      type: 'user.alert',
      title: 'Alice Alert 2',
      sourceApp: 'app-main',
    });
    await service.notify({
      recipientUserId: 'usr_bob',
      idempotencyKey: 'bob_1',
      type: 'user.alert',
      title: 'Bob Alert 1',
      sourceApp: 'app-main',
    });

    const aliceInbox = await service.getInbox('usr_alice');
    const bobInbox = await service.getInbox('usr_bob');

    expect(aliceInbox.total).toBe(2);
    expect(aliceInbox.data.map((r) => r.title)).toEqual(['Alice Alert 2', 'Alice Alert 1']);
    expect(aliceInbox.data.every((r) => r.recipientUserId === 'usr_alice')).toBe(true);

    expect(bobInbox.total).toBe(1);
    expect(bobInbox.data[0].title).toBe('Bob Alert 1');
    expect(bobInbox.data[0].recipientUserId).toBe('usr_bob');
  });

  it('strictly isolates unread count between users', async () => {
    await service.notify({
      recipientUserId: 'usr_alice',
      idempotencyKey: 'alice_msg',
      type: 'msg',
      title: 'Alice Message',
      sourceApp: 'app-chat',
    });
    await service.notify({
      recipientUserId: 'usr_bob',
      idempotencyKey: 'bob_msg_1',
      type: 'msg',
      title: 'Bob Message 1',
      sourceApp: 'app-chat',
    });
    await service.notify({
      recipientUserId: 'usr_bob',
      idempotencyKey: 'bob_msg_2',
      type: 'msg',
      title: 'Bob Message 2',
      sourceApp: 'app-chat',
    });

    const aliceUnread = await service.getUnreadCount('usr_alice');
    const bobUnread = await service.getUnreadCount('usr_bob');

    expect(aliceUnread.count).toBe(1);
    expect(bobUnread.count).toBe(2);
  });

  it('prevents user Alice from marking user Bob notification as read', async () => {
    const bobNote = await service.notify({
      recipientUserId: 'usr_bob',
      idempotencyKey: 'bob_secret',
      type: 'secret',
      title: 'Confidential',
      sourceApp: 'app-security',
    });

    // Alice attempts to mark Bob's notification as read
    await expect(service.markRead(bobNote.id, 'usr_alice')).rejects.toThrow(NotFoundException);

    // Bob's notification must remain unread
    const bobUnread = await service.getUnreadCount('usr_bob');
    expect(bobUnread.count).toBe(1);

    const bobInbox = await service.getInbox('usr_bob');
    expect(bobInbox.data[0].readAt).toBeNull();
  });

  it('prevents user Alice from archiving user Bob notification', async () => {
    const bobNote = await service.notify({
      recipientUserId: 'usr_bob',
      idempotencyKey: 'bob_archive_test',
      type: 'task',
      title: 'Bob Task',
      sourceApp: 'app-tasks',
    });

    // Alice attempts to archive Bob's notification
    await expect(service.archive(bobNote.id, 'usr_alice')).rejects.toThrow(NotFoundException);

    // Bob's notification must remain visible in Bob's inbox
    const bobInbox = await service.getInbox('usr_bob');
    expect(bobInbox.total).toBe(1);
    expect(bobInbox.data[0].archivedAt).toBeNull();
  });

  it('markAllRead only marks the calling user unread notifications as read', async () => {
    await service.notify({
      recipientUserId: 'usr_alice',
      idempotencyKey: 'alice_1',
      type: 'ping',
      title: 'Alice Ping 1',
      sourceApp: 'app-ops',
    });
    await service.notify({
      recipientUserId: 'usr_alice',
      idempotencyKey: 'alice_2',
      type: 'ping',
      title: 'Alice Ping 2',
      sourceApp: 'app-ops',
    });
    await service.notify({
      recipientUserId: 'usr_bob',
      idempotencyKey: 'bob_1',
      type: 'ping',
      title: 'Bob Ping 1',
      sourceApp: 'app-ops',
    });

    // Alice marks all as read
    const aliceMarkResult = await service.markAllRead('usr_alice');
    expect(aliceMarkResult.count).toBe(2);

    // Alice's unread is 0, but Bob's unread is still 1
    expect((await service.getUnreadCount('usr_alice')).count).toBe(0);
    expect((await service.getUnreadCount('usr_bob')).count).toBe(1);

    const bobInbox = await service.getInbox('usr_bob');
    expect(bobInbox.data[0].readAt).toBeNull();
  });

  it('allows identical idempotencyKeys across different recipients without collision', async () => {
    const sharedIdempotencyKey = 'order_created_1001';

    const aliceNote = await service.notify({
      recipientUserId: 'usr_alice',
      idempotencyKey: sharedIdempotencyKey,
      type: 'order',
      title: 'Order 1001 Confirmation for Alice',
      sourceApp: 'app-store',
    });

    const bobNote = await service.notify({
      recipientUserId: 'usr_bob',
      idempotencyKey: sharedIdempotencyKey,
      type: 'order',
      title: 'Order 1001 Delivery for Bob',
      sourceApp: 'app-store',
    });

    expect(aliceNote.id).not.toBe(bobNote.id);
    expect(aliceNote.recipientUserId).toBe('usr_alice');
    expect(bobNote.recipientUserId).toBe('usr_bob');
    expect(aliceNote.idempotencyKey).toBe(sharedIdempotencyKey);
    expect(bobNote.idempotencyKey).toBe(sharedIdempotencyKey);
  });
});
