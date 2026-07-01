---
"@appspine/m2m-api-key": patch
---

`ApiKeysController`'s write operations (`create`/`update`/`remove`) now record an `AuditLog` entry via `@appspine/audit-log`'s `AuditLogService`, added as a peer dependency. Same fire-and-forget behavior and actor resolution as `@appspine/auth`'s `UsersController`. The raw API key (only shown once at creation) is never included in the audit payload — only the key's `id` is recorded as `entityId`.
