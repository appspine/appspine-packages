import { NOTIFICATION_INBOX } from '@appspine/plugin-api';
import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * Provides the notification service both as a concrete class and behind the stable
 * `NOTIFICATION_INBOX` capability token (PL4-01).
 *
 * `useExisting`, not `useClass`: one service instance answers to both tokens, ensuring
 * that callers injecting either token share the exact same instance and cache/state.
 */
@Module({
  providers: [
    NotificationService,
    { provide: NOTIFICATION_INBOX, useExisting: NotificationService },
  ],
  exports: [NotificationService, NOTIFICATION_INBOX],
})
export class NotificationModule {}
