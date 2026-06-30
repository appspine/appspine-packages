---
"@appspine/rbac": minor
---

Add the `@appspine/rbac` package: `PermissionGuard` (ADMIN bypass → ALLOW_ALL → READ_ALL+`*_READ` → explicit grant), `RequirePermissions` decorator, and `RolesService`/`RolesController` (ADMIN-only Role/Permission CRUD, system roles protected from deletion/self-escalation). Ported from `auranest/packages/@auranest/backend-core` per `dev_docs/003-shared-package-reuse-plan.md`.
