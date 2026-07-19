---
"@appspine/domain-events": patch
"@appspine/frontend-shell": patch
---

Fix domain event admin review findings: restrict retry/ignore mutations to dead-letter deliveries, add an optional admin audit hook, split unresolved delivery keys from data-driven catalog entries, make date upper bounds inclusive by day, strengthen schema/subscriber drift checks, and surface unresolved catalog rows in the shared frontend table.
