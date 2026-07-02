# @appspine/e2e-kit

## 0.1.1

### Patch Changes

- Publish to the registry instead of being consumed only via a local `file:` link. `appspine-app-template/e2e/package.json` depended on it via `file:../../appspine/packages/e2e-kit`, which only resolves when both repos are checked out as siblings in this dev workspace (broke both CI and any real fork, same issue as frontend-shell).

## 0.1.0

### Minor Changes

- ab5e450: Add `@appspine/e2e-kit` (`dev_docs/004-task-breakdown.md` T-401~T-405):

  - `createPlaywrightConfig({ baseURL, apiURL })`: Playwright config factory, no hardcoded `localhost`.
  - `auth.fixture.ts`: logs in with a seeded account and caches `storageState` under `.auth/`, parameterized
    by config so the credentials/URLs come from the consuming app.
  - Golden path specs: `auth.spec.ts` (login → `/auth/me`), `rbac.spec.ts` (unauthorized access redirects
    to `/login`), `m2m-api-key.spec.ts` (create a key, call a scope-protected endpoint).
