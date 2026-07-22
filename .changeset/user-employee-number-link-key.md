---
"@appspine/auth": minor
---

Add a nullable, unique `employeeNumber` field to the `User` model — the
cross-app link key consuming apps use to look up their canonical person
record in `apps/org` (Enterprise Master Data). Backward compatible: existing
rows default to `null`, and apps that don't need org context can ignore the
field entirely.
