---
"@appspine/audit-log": minor
---

Add optional correlation-id support (`workflowId` on `RecordAuditLogDto`, and the `extractWorkflowId()` header helper) for the cross-app operation tracing convention in dev_docs 002/023 §2.5. Additive and backward compatible — `record()` omits the field from the write entirely when the caller doesn't pass a `workflowId`, so apps whose `AuditLog` schema hasn't been migrated to add the `workflow_id` column yet are unaffected. See `prisma/audit-log.prisma` for the field definition consuming apps need to copy into their own schema fragment.
