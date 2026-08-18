/**
 * `@appspine/auth` — transition-only compatibility facade (051 PL1-13).
 *
 * Every export below is a re-export from the package that owns it after the Phase 1 identity
 * split. Nothing is implemented here and nothing new will be: 051 decision 6 keeps this package
 * for at least one major transition window, 051 decision 7 puts new work in `identity-core` /
 * `oidc-auth`, and neither this plan nor its task breakdown authorises removing anything from
 * this surface.
 *
 * Migration map (PL0-04 §3):
 *
 * | old export                                  | new home                                  |
 * |---------------------------------------------|-------------------------------------------|
 * | `AuthModule`                                 | this file (composes the two new modules)  |
 * | `AuthController`, `JwtAuthGuard`,            | `@appspine/oidc-auth`                     |
 * | `JwtVerifierService`, `OidcStrategy`,        |                                           |
 * | `AUTH_AUDIT_LOG`, `delegated/*`              |                                           |
 * | `AdminGuard`, `SYSTEM_ADMIN_ROLE`,           | `@appspine/identity-core`                 |
 * | `SYSTEM_USER_ROLE`, `UsersController`,       |                                           |
 * | `UsersService`, user DTOs                    |                                           |
 * | `CurrentUser`, `JwtPayload`, `JwtUser`,      | `@appspine/plugin-host-nest`              |
 * | `CurrentUserPayload`, `resolveActingUserId`  | (`appspine.principal-context`)            |
 * | `buildUserContext`, `UserContext`,           | `@appspine/rbac`                          |
 * | `RoleWithPermissions`, `ApiKeyUser`          |                                           |
 * | `./prisma/user.prisma`                       | legacy fragment, kept byte-identical;     |
 * |                                              | `@appspine/identity-core/prisma/user.prisma` |
 * |                                              | is the split-out replacement (see README) |
 */

// Provider-neutral identity.
export {
  AdminGuard,
  type CreateUserDto,
  createUserSchema,
  SYSTEM_ADMIN_ROLE,
  SYSTEM_USER_ROLE,
  type UpdateRolesDto,
  type UpdateUserDto,
  UsersController,
  UsersService,
  updateRolesSchema,
  updateUserSchema,
} from '@appspine/identity-core';

// OIDC verification, guards, strategy and the delegated inbound trust profile.
export {
  AUTH_AUDIT_LOG,
  type AuthAuditLog,
  AuthController,
  CurrentDelegatedUser,
  DELEGATED_AUTH_PROFILES,
  DELEGATED_PROFILE_KEY,
  DelegatedAuthGuard,
  DelegatedAuthModule,
  type DelegatedAuthModuleOptions,
  DelegatedIdentityMappingError,
  DelegatedJwtVerifierService,
  type DelegatedOidcTrustProfile,
  DelegatedPrincipalMapperService,
  DelegatedProfile,
  type DelegatedTokenVerificationResult,
  type DelegationContext,
  JwtAuthGuard,
  JwtVerifierService,
  OidcStrategy,
  type VerifiedDelegatedClaims,
} from '@appspine/oidc-auth';
// Request identity. Host-owned since PL0-04 §2 — these were the types every capability package
// used to reach into this package for.
export {
  type ApiKeyUser,
  CurrentUser,
  type CurrentUserPayload,
  type JwtPayload,
  type JwtUser,
  resolveActingUserId,
} from '@appspine/plugin-host-nest';
// Role flattening. RBAC shapes in, RBAC shapes out — prefer the appspine.rbac-policy token.
export { buildUserContext, type RoleWithPermissions, type UserContext } from '@appspine/rbac';
// Module
export * from './auth.module';
