---
"@appspine/rbac": patch
---

`RolesController`'s write operations (`create`/`update`/`replacePermissions`/`remove`) now record an `AuditLog` entry via `@appspine/audit-log`'s `AuditLogService`, added as a peer dependency. Same fire-and-forget behavior and actor resolution as `@appspine/auth`'s `UsersController` (see that package's changelog).
