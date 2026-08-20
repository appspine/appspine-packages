---
"@appspine/audit-log": patch
"@appspine/domain-events": patch
"@appspine/health-check": patch
"@appspine/identity-core": patch
"@appspine/m2m-api-key": patch
"@appspine/master-data-client": patch
"@appspine/mcp-server": patch
"@appspine/metadata-schema": patch
"@appspine/notification": patch
"@appspine/oidc-auth": patch
"@appspine/oidc-delegation": patch
"@appspine/rbac": patch
---

Fix a release-blocking defect found during PL5-14's stable-publish review: the earlier canary
publish (Gate G5A) was run with `npm publish`, which does not understand pnpm's `workspace:*`
protocol and does not rewrite it before publishing. These 12 packages' real `dependencies` field
(as opposed to `devDependencies`, which npm strips on install anyway) declared their internal
`@appspine/*` cross-package dependencies as literal `workspace:*` strings, which made every one
of them completely uninstallable by any real external consumer — via either `npm install` or
`pnpm install` outside this exact monorepo's own workspace overrides — failing with
`EUNSUPPORTEDPROTOCOL` (npm) or `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` (pnpm). Republished via
`pnpm publish` this time, which correctly resolves `workspace:*` to the real semver version at
publish time (verified via `pnpm pack` before publishing). No behavior change.
