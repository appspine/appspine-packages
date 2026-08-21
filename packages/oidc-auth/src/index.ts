/**
 * `@appspine/oidc-auth` — OIDC interactive authentication and inbound delegated verification.
 *
 * Split out of `@appspine/auth` in Phase 1 (051 PL1-12). Owns JWKS/RS256 verification, the
 * `(issuer, subject)` identity mapping, JIT provisioning through `appspine.identity-store`, and
 * the delegated (RFC 8693) inbound trust profile. Deliberately owns no `User` model and no local
 * credential logic — a future `@appspine/local-auth` owns the latter and is mutually exclusive
 * with this package (051 decision 8).
 *
 * The login UI moves to `@appspine/oidc-auth/frontend` in Phase 3 (PL3-04); Phase 1 publishes the
 * reserved subpath so the package contract does not change during the move.
 */

export * from './auth.controller';
export * from './auth-audit-log';
export * from './config';
export * from './delegated';
export * from './guards/jwt-auth.guard';
export * from './jwt-verifier.service';
export * from './oidc-auth.module';
export * from './oidc-identity.service';
export * from './oidc-interactive.strategy';
export * from './strategies/oidc.strategy';
