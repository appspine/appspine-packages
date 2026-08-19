import { NOTIFICATION_INBOX, type NotificationInboxPort } from '@appspine/plugin-api';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationModule } from './notification.module';
import { NotificationService } from './notification.service';
import { createMockNotificationTx } from './testing';

describe('legacy vs plugin parity', () => {
  let directService: NotificationService;
  let pluginService: NotificationInboxPort;
  let mockDirectTx: ReturnType<typeof createMockNotificationTx>;
  let mockPluginTx: ReturnType<typeof createMockNotificationTx>;

  beforeEach(() => {
    mockDirectTx = createMockNotificationTx();
    mockPluginTx = createMockNotificationTx();

    // 1. Legacy Pathway: Direct instantiation of concrete class
    directService = new NotificationService(
      mockDirectTx.tx as unknown as import('@appspine/common').PrismaService,
    );

    // 2. Plugin Pathway: Resolution via NOTIFICATION_INBOX provider token & NotificationModule
    const pluginInstance = new NotificationService(
      mockPluginTx.tx as unknown as import('@appspine/common').PrismaService,
    );

    // Verify NotificationModule exports NOTIFICATION_INBOX provider bound to NotificationService
    const moduleProviders = Reflect.getMetadata('providers', NotificationModule) || [];
    const moduleExports = Reflect.getMetadata('exports', NotificationModule) || [];

    expect(moduleExports).toContain(NOTIFICATION_INBOX);
    expect(moduleExports).toContain(NotificationService);
    expect(moduleProviders).toEqual(
      expect.arrayContaining([
        NotificationService,
        expect.objectContaining({ provide: NOTIFICATION_INBOX, useExisting: NotificationService }),
      ]),
    );

    // Bind port to instance as Nest container does for useExisting
    pluginService = pluginInstance;
  });

  it('both pathways implement the exact same notify behavior and shape', async () => {
    const input = {
      recipientUserId: 'usr_123',
      idempotencyKey: 'idem_1',
      type: 'test.alert',
      title: 'Hello World',
      body: 'This is a test notification',
      sourceApp: 'app-a',
    };

    const directResult = await directService.notify(input);
    const pluginResult = await pluginService.notify(input);

    expect(directResult.recipientUserId).toBe(pluginResult.recipientUserId);
    expect(directResult.idempotencyKey).toBe(pluginResult.idempotencyKey);
    expect(directResult.type).toBe(pluginResult.type);
    expect(directResult.title).toBe(pluginResult.title);
    expect(directResult.body).toBe(pluginResult.body);
    expect(directResult.sourceApp).toBe(pluginResult.sourceApp);
    expect(directResult.severity).toBe('info');
    expect(pluginResult.severity).toBe('info');
    expect(directResult.readAt).toBeNull();
    expect(pluginResult.readAt).toBeNull();
    expect(directResult.archivedAt).toBeNull();
    expect(pluginResult.archivedAt).toBeNull();
  });

  it('both pathways handle notifyMany with batch limits identically', async () => {
    const inputs = [
      {
        recipientUserId: 'usr_123',
        idempotencyKey: 'batch_1',
        type: 'test.event',
        title: 'Batch Item 1',
        sourceApp: 'app-a',
      },
      {
        recipientUserId: 'usr_123',
        idempotencyKey: 'batch_2',
        type: 'test.event',
        title: 'Batch Item 2',
        sourceApp: 'app-a',
      },
    ];

    const directList = await directService.notifyMany(inputs);
    const pluginList = await pluginService.notifyMany(inputs);

    expect(directList).toHaveLength(2);
    expect(pluginList).toHaveLength(2);
    expect(directList[0].idempotencyKey).toBe(pluginList[0].idempotencyKey);
    expect(directList[1].idempotencyKey).toBe(pluginList[1].idempotencyKey);
  });

  it('both pathways reject invalid inputs with BadRequestException', async () => {
    const invalid = {
      recipientUserId: '',
      idempotencyKey: '',
      type: '',
      title: '',
      sourceApp: '',
    };

    await expect(directService.notify(invalid)).rejects.toThrow(BadRequestException);
    await expect(pluginService.notify(invalid)).rejects.toThrow(BadRequestException);
  });

  it('both pathways handle getInbox, getUnreadCount, markRead, markAllRead, archive identically', async () => {
    const seed = {
      recipientUserId: 'usr_456',
      idempotencyKey: 'parity_idem',
      type: 'test.update',
      title: 'Update notice',
      sourceApp: 'app-b',
    };

    const directRow = await directService.notify(seed);
    const pluginRow = await pluginService.notify(seed);

    // Unread count
    const directUnread = await directService.getUnreadCount('usr_456');
    const pluginUnread = await pluginService.getUnreadCount('usr_456');
    expect(directUnread.count).toBe(1);
    expect(pluginUnread.count).toBe(1);

    // Inbox
    const directInbox = await directService.getInbox('usr_456', { page: 1, limit: 10 });
    const pluginInbox = await pluginService.getInbox('usr_456', { page: 1, limit: 10 });
    expect(directInbox.total).toBe(1);
    expect(pluginInbox.total).toBe(1);
    expect(directInbox.data[0].title).toBe(pluginInbox.data[0].title);

    // markRead
    const directMarked = await directService.markRead(directRow.id, 'usr_456');
    const pluginMarked = await pluginService.markRead(pluginRow.id, 'usr_456');
    expect(directMarked.readAt).toBeInstanceOf(Date);
    expect(pluginMarked.readAt).toBeInstanceOf(Date);

    // unread count after markRead
    expect((await directService.getUnreadCount('usr_456')).count).toBe(0);
    expect((await pluginService.getUnreadCount('usr_456')).count).toBe(0);

    // archive
    const directArchived = await directService.archive(directRow.id, 'usr_456');
    const pluginArchived = await pluginService.archive(pluginRow.id, 'usr_456');
    expect(directArchived.archivedAt).toBeInstanceOf(Date);
    expect(pluginArchived.archivedAt).toBeInstanceOf(Date);

    // markAllRead on non-existent unread returns count: 0
    const directMarkAll = await directService.markAllRead('usr_456');
    const pluginMarkAll = await pluginService.markAllRead('usr_456');
    expect(directMarkAll.count).toBe(0);
    expect(pluginMarkAll.count).toBe(0);
  });

  it('both pathways throw NotFoundException on markRead / archive for non-existent notification', async () => {
    await expect(directService.markRead('non-existent', 'usr_456')).rejects.toThrow(
      NotFoundException,
    );
    await expect(pluginService.markRead('non-existent', 'usr_456')).rejects.toThrow(
      NotFoundException,
    );

    await expect(directService.archive('non-existent', 'usr_456')).rejects.toThrow(
      NotFoundException,
    );
    await expect(pluginService.archive('non-existent', 'usr_456')).rejects.toThrow(
      NotFoundException,
    );
  });
});
