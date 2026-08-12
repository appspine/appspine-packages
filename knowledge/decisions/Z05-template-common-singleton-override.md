---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-07-03
updated: 2026-08-03
---

# Z05 - Template Common Package Singleton Override
> 註：本檔編號與 app-calendar 的 Z05 衝突，屬 framework 之獨立記錄。

## Context

During 011 T-1095 backend startup verification, NestJS failed while creating `RbacModule`.

## Finding

After template consumed `@appspine/common@0.2.0`, pnpm installed two versions of `@appspine/common`:

- `@appspine/common@0.2.0` as the app's direct dependency.
- `@appspine/common@0.1.1` under older published framework packages such as `@appspine/rbac@1.0.0`.

That made Nest see two different `PrismaService` class tokens. `PrismaModule` exported the app's direct `@appspine/common@0.2.0` token, while `RolesService` requested the token from its nested `@appspine/common@0.1.1` copy.

Observed error:

```text
Nest can't resolve dependencies of the RolesService (?). Please make sure that the argument PrismaService at index [0] is available in the RbacModule module.
```

## Resolution

Add a template-level pnpm override in `pnpm-workspace.yaml`:

```yaml
overrides:
  '@appspine/common': 0.2.0
```

This keeps the app on the published framework versions required by 011 while ensuring `PrismaService` remains a singleton package token across framework modules.

## Verification

Re-run:

```powershell
pnpm install
pnpm -C backend build
pnpm -C backend start
```

Then verify `GET /health` returns 200 and `pnpm -C backend why @appspine/common` reports a single effective app version for framework runtime modules.

