---
'@appspine/health-check': minor
'@appspine/audit-log': minor
---

Ship the first two capability plugins (051 PL1-08, PL1-09).

Both packages now publish an `appspine.plugin.json` manifest and a `./plugin` subpath exporting a
`definePlugin()` descriptor. Plugin mode contributes the very same Nest module the package root
already exported, so legacy wiring and plugin wiring cannot diverge in behaviour.

`@appspine/audit-log` additionally binds its service to the stable `AUDIT_SINK` token and declares
its Prisma facet with a digest of the shipped fragment, so a consumer can depend on the audit
capability without importing the package. The concrete `AuditLogService` export and the module's
`@Global()` marker are unchanged during the transition window.
