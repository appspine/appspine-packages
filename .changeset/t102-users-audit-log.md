---
"@appspine/auth": patch
---

`UsersController`'s write operations (`create`/`update`/`updateRoles`/`remove`) now record an `AuditLog` entry via `@appspine/audit-log`'s `AuditLogService`, added as a peer dependency. Recording is fire-and-forget — an audit write failure is logged as a warning but never blocks the business response. Actor resolution handles both JWT users (`actor.email`) and M2M API key callers (`actor.email` is absent, falls back to `api-key:${actor.sub}`).
