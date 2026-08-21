/**
 * The frozen capability-name registry (PL0-03 section 3).
 *
 * Capability names are deliberately decoupled from package names: a plugin may provide several,
 * and "package X is installed" is never a substitute for "capability Y resolved" (051 plan
 * section 4.2). Adding a name here without first registering it in
 * `knowledge/topics/051-pl0-package-classification.md` is a governance violation — the PL1-07
 * architecture checker enforces that the two lists agree.
 */

export const CAPABILITY = {
  prisma: 'appspine.prisma',
  auditSink: 'appspine.audit-sink',
  identityStore: 'appspine.identity-store',
  interactiveAuthProvider: 'appspine.interactive-auth-provider',
  machineAuthProvider: 'appspine.machine-auth-provider',
  authenticationStrategyRegistry: 'appspine.authentication-strategy-registry',
  principalContext: 'appspine.principal-context',
  scopeMatcher: 'appspine.scope-matcher',
  domainEvents: 'appspine.domain-events',
  notificationInbox: 'appspine.notification-inbox',
  mcpTools: 'appspine.mcp-tools',
  rbacPolicy: 'appspine.rbac-policy',
  metadataSchema: 'appspine.metadata-schema',
  masterDataClient: 'appspine.master-data-client',
  identityDelegation: 'appspine.identity-delegation',
  delegatedIdentityVerifier: 'appspine.delegated-identity-verifier',
  healthIndicator: 'appspine.health-indicator',
} as const;

export type RegisteredCapabilityName = (typeof CAPABILITY)[keyof typeof CAPABILITY];

/** Every registered name, sorted, so diagnostics and digests stay deterministic. */
export const REGISTERED_CAPABILITIES: readonly string[] = Object.freeze(
  [...new Set(Object.values(CAPABILITY))].sort(),
);

/**
 * Capabilities the host itself provides. A plugin may `requires` these without any other plugin
 * being installed, and no plugin may `provides` them (PL0-03 section 3 marks them host-owned).
 */
export const HOST_PROVIDED_CAPABILITIES: readonly string[] = Object.freeze([
  CAPABILITY.authenticationStrategyRegistry,
  CAPABILITY.principalContext,
]);

/**
 * Interactive login providers are mutually exclusive in v1 (051 decision 8): `oidc-auth` and a
 * future `local-auth` must declare each other in `conflicts`.
 */
export const INTERACTIVE_AUTH_CAPABILITY = CAPABILITY.interactiveAuthProvider;

/**
 * Capabilities whose providers register *with the host strategy registry* instead of exposing a
 * single injectable token. There is deliberately no `INTERACTIVE_AUTH_PROVIDER` symbol: a business
 * plugin must never inject a login provider directly — it reads the resolved principal from
 * `PRINCIPAL_CONTEXT` (051 plan section 6.3). `tokens.spec` asserts this list and `CAPABILITY_TOKENS`
 * together cover the whole registry, so a new capability cannot silently end up with neither.
 */
export const STRATEGY_REGISTERED_CAPABILITIES: readonly string[] = Object.freeze([
  CAPABILITY.interactiveAuthProvider,
  CAPABILITY.machineAuthProvider,
]);

export function isRegisteredCapability(name: string): name is RegisteredCapabilityName {
  return (REGISTERED_CAPABILITIES as string[]).includes(name);
}

/**
 * Multi-instance plugins expose both the bare capability name and an instance-qualified one, per
 * the PL0-03 namespace rule `appspine.<plugin-id>#<instanceId>`. Requirements written against the
 * bare name resolve to every providing instance.
 */
export function qualifyCapability(capability: string, instanceId: string): string {
  return `${capability}#${instanceId}`;
}

export function parseQualifiedCapability(qualified: string): {
  capability: string;
  instanceId?: string;
} {
  const hash = qualified.indexOf('#');
  if (hash === -1) return { capability: qualified };
  return { capability: qualified.slice(0, hash), instanceId: qualified.slice(hash + 1) };
}
