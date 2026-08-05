# @appspine/notification

Shared in-app notification primitives for AppSpine consumers.

The package provides a transaction-aware `NotificationService`, first-write-wins
idempotency, recipient-scoped inbox queries and mutations, validation constants,
and a Prisma schema drift contract. Consumers own authentication, authorization,
routes, notification copy, and the Prisma migration for their physical table.

```ts
const notification = new NotificationService(prisma);

await notification.notify({
  recipientUserId: principal.userId,
  idempotencyKey: `project.issue.assigned:create:${issue.id}:${principal.userId}`,
  type: "project.issue.assigned",
  category: "project",
  title: "Issue assigned",
  targetPath: `/dashboard/projects/${project.id}/issues/${issue.id}`,
});
```

Use the `./testing` export for structural delegate mocks in package or consumer
contract tests. This package is Phase 1 in-app only; it does not send email or
provide realtime delivery.
