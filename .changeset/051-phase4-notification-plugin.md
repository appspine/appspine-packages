---
'@appspine/notification': minor
'@appspine/plugin-api': minor
'@appspine/identity-core': patch
---

Migrate notification capability package to full plugin model (051 PL4-01).

- `@appspine/notification`: declare backend, prisma, operations, frontend, and permissions facets in `appspine.plugin.json` and `./plugin`; export `NotificationModule` binding `NotificationService` to `NOTIFICATION_INBOX`; ship `prisma/notification.prisma` with schema digest and User model augmentation; implement full 4-stage lifecycle (`validate` -> `register` -> `ready` -> `shutdown`) and resource cleanup registry.
- `@appspine/plugin-api`: define `NotificationInboxPort` and related types in `ports.ts`.
- `@appspine/identity-core`: declare `notification` plugin as authorized augmenter of `User.notifications` relation in `augmentedBy`.
