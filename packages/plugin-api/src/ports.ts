/**
 * Minimal interfaces behind the stable tokens in `tokens.ts`.
 *
 * Each port is the *smallest* shape a consumer needs — deliberately narrower than the concrete
 * service it will be bound to, so a capability plugin can depend on the contract without
 * importing the provider (051 plan section 6.1). Every port here is structurally satisfied by
 * the service that exists today, so binding one is a wiring change, not a behaviour change.
 */

import type { Principal, PrincipalAuthorization } from './principal';

/** Mirrors `@appspine/common`'s `AuditAction` without depending on it. */
export type AuditActionName = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'MOVE';

export interface AuditRecordInput {
  entityType: string;
  entityId: string;
  action: AuditActionName;
  actorId: string;
  actorEmail: string;
  appName: string;
  isAiOperation?: boolean;
  mcpTool?: string | null;
  actingApiKeyId?: string | null;
  workflowId?: string | null;
}

/** `appspine.audit-sink` — satisfied by `@appspine/audit-log`'s `AuditLogService`. */
export interface AuditSinkPort {
  /**
   * When `transaction` is supplied, the sink must write through that transaction client. This
   * keeps a capability owner in charge of its own persistence shape while allowing another
   * plugin to make its state change and the corresponding audit record atomic.
   */
  record(input: AuditRecordInput, transaction?: unknown): Promise<unknown>;
}

/** Provider-neutral user record owned by `identity-core`. No password, no roles, no API keys. */
export interface IdentityRecord {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  isServiceAccount: boolean;
}

/** A role as RBAC stores it. Kept opaque to identity-core: it only passes these through. */
export interface RoleGrant {
  id?: string;
  name: string;
  displayName?: string;
  permissionPolicy: string;
  permissions: { permission: string }[];
}

export interface IdentityWithRoles extends IdentityRecord {
  /** Empty when no RBAC plugin is installed — an identity without roles is still an identity. */
  roles: RoleGrant[];
}

export interface CreateIdentityInput {
  email: string;
  name?: string | null;
  isServiceAccount?: boolean;
  /**
   * Role IDs the *caller* already resolved. `identity-core` never queries RBAC's `Role` table to
   * pick a default (PL0-04 section 2) — the caller owns that policy decision.
   */
  roleIds?: string[];
}

/**
 * `appspine.identity-store` — the only way another plugin may read or create users.
 * `m2m-api-key`'s acting-user check and `oidc-auth`'s JIT provisioning both go through this
 * instead of reaching into the `User` table directly (PL0-04 section 2).
 */
export interface IdentityStorePort {
  findById(id: string): Promise<IdentityRecord | null>;
  findByEmail(email: string): Promise<IdentityRecord | null>;
  findWithRolesById(id: string): Promise<IdentityWithRoles | null>;
  findWithRolesByEmail(email: string): Promise<IdentityWithRoles | null>;
  /**
   * When `transaction` is supplied, the store must write through that transaction client — same
   * contract as `AuditSinkPort.record`. An authentication plugin needs it so that provisioning an
   * account and recording the external identity that caused it either both happen or neither does;
   * without it, a rolled-back mapping leaves an orphan account that the next login mistakes for a
   * pre-existing one.
   */
  create(input: CreateIdentityInput, transaction?: unknown): Promise<IdentityRecord>;
}

/**
 * `appspine.rbac-policy` — flattens a set of role grants into an effective authorization.
 * Owned by `rbac`: identity and auth plugins consume the result, never the algorithm
 * (PL0-04 section 2, "`user-context.util` -> rbac").
 */
export interface RbacPolicyPort {
  flatten(roles: RoleGrant[]): PrincipalAuthorization;
  /** Loads the RBAC-owned grants for an identity without exposing `UserRole` to identity-core. */
  rolesForUser(userId: string): Promise<RoleGrant[]>;
  /**
   * Role IDs to grant a user created without an explicit list. Identity does not get to decide
   * what "no roles specified" means — that is RBAC policy (PL0-04 section 2).
   */
  defaultRoleIds(): Promise<string[]>;
  /** Replaces a user's role assignments atomically. `UserRole` is RBAC's join table, not identity's. */
  replaceUserRoles(userId: string, roleIds: string[], transaction?: unknown): Promise<void>;
}

/** `appspine.scope-matcher` — owned by `m2m-api-key`. */
export interface ScopeMatcherPort {
  matches(scopes: string[], required: string): boolean;
}

/**
 * `appspine.principal-context` — host-owned. Gives every plugin the resolved request identity
 * without letting it guess at JWT or API-key internals (051 plan section 4.2).
 */
export interface PrincipalContextPort {
  /** The principal for the request in flight, or `null` on an unauthenticated route. */
  current(): Principal | null;
  /** Throws rather than returning `null`; use on routes a guard has already protected. */
  require(): Principal;
}

export type NotificationSeverityName = 'info' | 'success' | 'warning' | 'critical';

export interface NotificationRecord {
  id: string;
  recipientUserId: string;
  idempotencyKey: string;
  type: string;
  category: string | null;
  severity: NotificationSeverityName;
  title: string;
  body: string | null;
  sourceApp: string;
  sourceEventId: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  targetPath: string | null;
  readAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationInput {
  recipientUserId: string;
  idempotencyKey: string;
  type: string;
  category?: string | null;
  severity?: NotificationSeverityName;
  title: string;
  body?: string | null;
  sourceApp: string;
  sourceEventId?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  targetPath?: string | null;
}

export interface NotificationQuery {
  page?: number;
  limit?: number;
}

export interface NotificationPage {
  data: NotificationRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface NotificationPortOptions {
  tx?: unknown;
}

/**
 * `appspine.notification-inbox` — satisfied by `@appspine/notification`'s `NotificationService`.
 */
export interface NotificationInboxPort {
  notify(
    input: CreateNotificationInput,
    options?: NotificationPortOptions,
  ): Promise<NotificationRecord>;
  notifyMany(
    inputs: CreateNotificationInput[],
    options?: NotificationPortOptions,
  ): Promise<NotificationRecord[]>;
  getInbox(
    recipientUserId: string,
    query?: NotificationQuery,
    options?: NotificationPortOptions,
  ): Promise<NotificationPage>;
  getUnreadCount(
    recipientUserId: string,
    options?: NotificationPortOptions,
  ): Promise<{ count: number }>;
  markRead(
    notificationId: string,
    recipientUserId: string,
    options?: NotificationPortOptions,
  ): Promise<NotificationRecord>;
  markAllRead(
    recipientUserId: string,
    options?: NotificationPortOptions,
  ): Promise<{ count: number }>;
  archive(
    notificationId: string,
    recipientUserId: string,
    options?: NotificationPortOptions,
  ): Promise<NotificationRecord>;
}

/**
 * `appspine.metadata-schema` — satisfied by `@appspine/metadata-schema`'s `MetaService`.
 */
export interface MetadataSchemaPort {
  buildMeta(): unknown;
}

export interface RecordDomainEventPortInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  schemaVersion?: number;
  actorUserId?: string | null;
  correlationId?: string | null;
  workflowId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changedFields?: string[];
  metadata?: Record<string, unknown> | null;
  integration?: {
    capabilityId: string;
    capabilityVersion: string;
    bindingId: string;
    bindingVersion: string;
    envelopeVersion?: string;
    sourceApp?: string;
    payload: unknown;
    payloadDigest?: string;
    payloadSchema?: unknown;
  } | null;
}

/**
 * `appspine.domain-events` — satisfied by `@appspine/domain-events`'s `DomainEventsService`.
 */
export interface DomainEventsPort {
  record(tx: unknown, input: RecordDomainEventPortInput): Promise<unknown>;
}
