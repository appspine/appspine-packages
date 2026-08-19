---
"@appspine/frontend-shell": minor
---

Correct a version collision found during Gate G5A independent review: `@appspine/frontend-shell@0.16.4`
was already live on the registry from an unrelated prior release (the standalone `widen-shell-link-props`
changeset) and did not contain the Phase 1–4 admin UI additions (Plugin Catalog, Users/Roles/API
Keys/Domain Events/Notification admin components) that accumulated in this package without their own
changesets. Bumps to `0.17.0` so the version actually published matches the version's real content.
