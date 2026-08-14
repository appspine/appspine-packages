---
"@appspine/frontend-shell": minor
---

Add a `@appspine/frontend-shell/server` entry point exporting the Next.js server-side
scaffolding shared by every business-app fork's `frontend/src/server/`: a
`createGetCurrentUser(apiFetch)` factory for a cached, 401-tolerant `getCurrentUser()`,
list-URL query helpers (`buildListHref`/`buildSortHref`/`parseSortOrder`/`formatPageInfo`),
`setLocaleAction`, and cookie helpers (`setValueToCookie`/`getPreference`). Each host app
still supplies its own `apiFetch` implementation via dependency injection — this only
consolidates the identical boilerplate that was previously duplicated byte-for-byte across
9 repos (the template plus 8 business apps).
