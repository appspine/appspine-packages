---
'@appspine/common': patch
'@appspine/domain-events': patch
'@appspine/frontend-shell': patch
---

Reduce domain-event dispatcher database work with bulk stale-lock reclamation and skip empty or duplicate delivery fan-out writes. Improve shared admin-table rendering by indexing service accounts once, tighten sortable-link component types, and align the pagination helper type with its existing default behavior.
