# @appspine/e2e-kit

## 0.1.3

### Patch Changes

- 8d996c9: Fix `registerM2mApiKeySpec` hardcoding a `users:read` restricted scope that no
  longer exists in any app's `/metadata/schema` response (`User` is `@internal`
  and excluded from `deriveScopes`). The spec now creates the wildcard key
  first, reads the app's real `availableScopes` from the response, and picks a
  non-wildcard scope from that list to test restriction against — no per-app
  configuration needed. Fixes a 30s UI timeout on `createApiKeyFromUi` for
  every app that wires real metadata-backed scope options into the Create API
  key dialog.

## 0.1.2

### Patch Changes

- Force the `locale=en` cookie before interacting with the login form in `auth.fixture.ts`, `auth.spec.ts`, and `rbac.spec.ts`'s anonymous test. These specs use hardcoded English locators (`getByLabel('Email')`, `getByText('Sign in')`, etc.), which broke against any app whose default locale isn't English — including `appspine-app-template`, which defaults to `zh-TW`.

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
