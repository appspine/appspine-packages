/**
 * Stable cross-plugin injection tokens (051 plan section 6.1).
 *
 * `Symbol.for` — not `Symbol()` — so a token stays identical across duplicated copies of this
 * package in a consumer's node_modules tree. A plugin that injects `AUDIT_SINK` must not import
 * `@appspine/audit-log`; the whole point of these tokens is that the dependency runs from the
 * provider to the contract, never from one capability plugin to another.
 *
 * Token symbol descriptions match the capability names in `capabilities.ts` one-for-one, which is
 * what lets the host map a manifest `requires` entry to the provider token it will inject.
 */

import { CAPABILITY } from './capabilities';

export const PRISMA = Symbol.for(CAPABILITY.prisma);
export const AUDIT_SINK = Symbol.for(CAPABILITY.auditSink);
export const IDENTITY_STORE = Symbol.for(CAPABILITY.identityStore);
export const AUTHENTICATION_STRATEGY_REGISTRY = Symbol.for(
  CAPABILITY.authenticationStrategyRegistry,
);
export const PRINCIPAL_CONTEXT = Symbol.for(CAPABILITY.principalContext);
export const SCOPE_MATCHER = Symbol.for(CAPABILITY.scopeMatcher);
export const RBAC_POLICY = Symbol.for(CAPABILITY.rbacPolicy);
export const DOMAIN_EVENTS = Symbol.for(CAPABILITY.domainEvents);
export const NOTIFICATION_INBOX = Symbol.for(CAPABILITY.notificationInbox);
export const MCP_TOOLS = Symbol.for(CAPABILITY.mcpTools);
export const METADATA_SCHEMA = Symbol.for(CAPABILITY.metadataSchema);
export const IDENTITY_DELEGATION = Symbol.for(CAPABILITY.identityDelegation);
export const DELEGATED_IDENTITY_VERIFIER = Symbol.for(CAPABILITY.delegatedIdentityVerifier);
export const MASTER_DATA_CLIENT = Symbol.for(CAPABILITY.masterDataClient);
export const HEALTH_INDICATOR = Symbol.for(CAPABILITY.healthIndicator);

/** Capability name -> token, for hosts turning a resolved graph into Nest providers. */
export const CAPABILITY_TOKENS: Readonly<Record<string, symbol>> = Object.freeze({
  [CAPABILITY.prisma]: PRISMA,
  [CAPABILITY.auditSink]: AUDIT_SINK,
  [CAPABILITY.identityStore]: IDENTITY_STORE,
  [CAPABILITY.authenticationStrategyRegistry]: AUTHENTICATION_STRATEGY_REGISTRY,
  [CAPABILITY.principalContext]: PRINCIPAL_CONTEXT,
  [CAPABILITY.scopeMatcher]: SCOPE_MATCHER,
  [CAPABILITY.rbacPolicy]: RBAC_POLICY,
  [CAPABILITY.domainEvents]: DOMAIN_EVENTS,
  [CAPABILITY.notificationInbox]: NOTIFICATION_INBOX,
  [CAPABILITY.mcpTools]: MCP_TOOLS,
  [CAPABILITY.metadataSchema]: METADATA_SCHEMA,
  [CAPABILITY.identityDelegation]: IDENTITY_DELEGATION,
  [CAPABILITY.delegatedIdentityVerifier]: DELEGATED_IDENTITY_VERIFIER,
  [CAPABILITY.masterDataClient]: MASTER_DATA_CLIENT,
  [CAPABILITY.healthIndicator]: HEALTH_INDICATOR,
});

/**
 * Multi-instance providers register one token per instance so two instances never collide
 * (051 plan section 4.4). Mirrors `qualifyCapability()`'s naming.
 */
export function capabilityInstanceToken(capability: string, instanceId: string): symbol {
  return Symbol.for(`${capability}#${instanceId}`);
}
