// Mirrors @appspine/auth's UsersService (packages/auth/src/users/users.service.ts)
// response shape. Defined locally because the frontend doesn't depend on backend packages.
export interface UserRoleRef {
  id: string;
  name: string;
  displayName: string;
  permissionPolicy: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  isServiceAccount: boolean;
  createdAt: string;
  roles: UserRoleRef[];
}

// Mirrors @appspine/rbac's RolesService.mapRole() output.
export interface UserRoleOption {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
}

// A resolved enum value ready for display. Producing the label requires
// server-side i18n (`getTranslations`/`enumLabel`, which stay app-owned per
// dev_docs/021 §2.3) so client components receive plain serializable data.
export interface EnumOption {
  value: string;
  label: string;
}

// Mirrors @appspine/rbac's RolesService.mapRole() output
// (packages/rbac/src/roles/roles.service.ts). Defined locally because the frontend
// doesn't depend on backend packages.
export interface RoleRow {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  permissionPolicy: string;
  permissions: string[];
  userCount: number;
  apiKeyCount: number;
}

// Mirrors @appspine/m2m-api-key's ApiKeysService.ApiKeyRecord shape
// (packages/m2m-api-key/src/api-keys.service.ts), with Date fields as ISO
// strings since they cross the wire as JSON. Defined locally because the frontend
// doesn't depend on backend packages.
export interface ApiKeyRoleRef {
  id: string;
  name: string;
  displayName: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  roleId: string;
  actingUserId: string | null;
  role: ApiKeyRoleRef;
  scopes: string[];
  rateLimit: number | null;
  isActive: boolean;
  expiresAt: string | null;
  createdBy: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// The one-time creation response: `key` is only ever present here, never on
// ApiKeyRow (list/detail responses only return the non-secret `prefix`).
export interface CreateApiKeyResponse {
  id: string;
  key: string;
  prefix: string;
  name: string;
  roleId: string;
  role: ApiKeyRoleRef;
  scopes: string[];
  createdAt: string;
}

export interface ApiKeyRoleOption {
  id: string;
  name: string;
  displayName: string;
}

export interface ServiceAccountOption {
  id: string;
  email: string;
  name: string | null;
}

export interface ApiKeyScopeOption {
  value: string;
  label: string;
}

// Fallback scope list for apps that haven't wired /metadata/schema into the
// API key page yet.
export const SCOPE_RESOURCES = ['users', 'api-keys'] as const;
export const SCOPE_ACTIONS = ['read', 'write'] as const;

// Mirrors @appspine/domain-events' DomainEventDeliveryStatus/DomainEventOperation const objects
// (packages/domain-events/src/types.ts) — these are package consts, not app Prisma enums, so
// check:enum-i18n doesn't cover their i18n keys (see the domainEvents.* i18n key list doc).
export type DomainEventEnumKind = 'DomainEventOperation' | 'DomainEventDeliveryStatus';

// Mirrors @appspine/domain-events' DomainEventDeliveryRecord shape
// (packages/domain-events/src/types.ts), with Date fields as ISO strings since they cross the
// wire as JSON. Defined locally because the frontend doesn't depend on backend packages.
export interface DomainEventDeliveryRow {
  id: string;
  eventId: string;
  handlerKey: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  processedAt: string | null;
  createdAt: string;
}

// Mirrors @appspine/domain-events' DomainEventRecord shape, with `seq` already stringified
// (002 BigInt discipline — the admin API serializes it before the wire, see
// packages/domain-events/src/admin/domain-events-admin.service.ts).
export interface DomainEventRow {
  id: string;
  seq: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  operation: string;
  schemaVersion: number;
  actorUserId: string | null;
  correlationId: string | null;
  workflowId: string | null;
  before: unknown;
  after: unknown;
  changedFields: string[];
  metadata: unknown;
  createdAt: string;
  deliveries: DomainEventDeliveryRow[];
}

// Mirrors @appspine/domain-events' DomainEventDeliveryStats shape
// (packages/domain-events/src/admin/types.ts), with the Date field as an ISO string.
export interface DomainEventDeliveryStatsRow {
  total: number;
  processed: number;
  deadLetter: number;
  lastStatus: string | null;
  lastError: string | null;
  lastAttemptAt: string | null;
}

// Mirrors @appspine/domain-events' DomainEventCatalogSubscriberEntry shape.
export interface DomainEventCatalogSubscriberRow {
  key: string;
  eventTypes: string[];
  description: string;
  stats: DomainEventDeliveryStatsRow;
}

// Mirrors @appspine/domain-events' DomainEventCatalogDataDrivenEntry shape.
export interface DomainEventCatalogDataDrivenRow extends DomainEventDeliveryStatsRow {
  handlerKey: string;
}

export interface DomainEventCatalogUnresolvedRow extends DomainEventDeliveryStatsRow {
  handlerKey: string;
}

// Mirrors @appspine/domain-events' DomainEventCatalogResponse shape
// (GET /domain-events/catalog — packages/domain-events/src/admin/types.ts).
export interface DomainEventCatalogView {
  subscribers: DomainEventCatalogSubscriberRow[];
  dataDrivenPrefixes: string[];
  hasHandlerKeyContributors: boolean;
  dataDrivenDeliveries: DomainEventCatalogDataDrivenRow[];
  unresolvedDeliveries: DomainEventCatalogUnresolvedRow[];
  statsWindowDays: number;
}
