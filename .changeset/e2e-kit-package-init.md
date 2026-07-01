---
"@appspine/e2e-kit": minor
---

Add `@appspine/e2e-kit` (`dev_docs/004-task-breakdown.md` T-401~T-405):

- `createPlaywrightConfig({ baseURL, apiURL })`: Playwright config factory, no hardcoded `localhost`.
- `auth.fixture.ts`: logs in with a seeded account and caches `storageState` under `.auth/`, parameterized
  by config so the credentials/URLs come from the consuming app.
- Golden path specs: `auth.spec.ts` (login → `/auth/me`), `rbac.spec.ts` (unauthorized access redirects
  to `/login`), `m2m-api-key.spec.ts` (create a key, call a scope-protected endpoint).
