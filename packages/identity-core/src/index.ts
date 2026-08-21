/**
 * `@appspine/identity-core` — provider-neutral user and service-account identity.
 *
 * Owns the `User` model, Users CRUD and the `appspine.identity-store` capability. Deliberately
 * knows nothing about OIDC, password verification, roles or API keys (051 plan section 6.3): those
 * live in `@appspine/oidc-auth`, a future `local-auth`, `@appspine/rbac` and
 * `@appspine/m2m-api-key` respectively, and reach identity only through stable tokens.
 *
 * The Users Admin UI moves to `@appspine/identity-core/frontend` in Phase 3 (PL3-03); Phase 1
 * publishes that reserved subpath so the package contract does not change during the move.
 */

export * from './constants';
export * from './guards/admin.guard';
export * from './identity-core.module';
export * from './identity-store.service';
export * from './users/dto/user.dto';
export * from './users/users.controller';
export * from './users/users.service';
