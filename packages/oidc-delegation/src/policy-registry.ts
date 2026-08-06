import type { DelegationPolicyConfig } from './types';

// Fail-fast bounds checked at module init (see 042-oidc-delegation-package-plan.md §8, T-16810).
const MAX_EXPIRES_IN_SECONDS_CEILING = 3600;

export class PolicyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyConfigurationError';
  }
}

export class PolicyNotFoundError extends Error {
  constructor(readonly policyName: string) {
    super(`Unknown delegation policy: ${policyName}`);
    this.name = 'PolicyNotFoundError';
  }
}

export class PolicyRegistry {
  private readonly policies: ReadonlyMap<string, DelegationPolicyConfig>;

  constructor(policies: Record<string, DelegationPolicyConfig>) {
    const entries = Object.entries(policies);
    if (entries.length === 0) {
      throw new PolicyConfigurationError('At least one delegation policy must be configured');
    }

    for (const [name, policy] of entries) {
      validatePolicy(name, policy);
    }

    this.policies = new Map(entries);
  }

  /** Fail closed: unregistered policy names must never reach the provider. */
  resolve(name: string): DelegationPolicyConfig {
    const policy = this.policies.get(name);
    if (!policy) {
      throw new PolicyNotFoundError(name);
    }
    return policy;
  }

  has(name: string): boolean {
    return this.policies.has(name);
  }
}

function validatePolicy(name: string, policy: DelegationPolicyConfig): void {
  if (!name || typeof name !== 'string') {
    throw new PolicyConfigurationError('Policy name must be a non-empty string');
  }
  if (!policy || typeof policy !== 'object') {
    throw new PolicyConfigurationError(`Policy "${name}" configuration must be an object`);
  }
  if (typeof policy.targetAudience !== 'string' || policy.targetAudience.length === 0) {
    throw new PolicyConfigurationError(`Policy "${name}" must have a non-empty targetAudience`);
  }
  if (!Array.isArray(policy.requestedScopes) || policy.requestedScopes.length === 0) {
    throw new PolicyConfigurationError(`Policy "${name}" must have at least one requestedScope`);
  }
  if (policy.requestedScopes.some((scope) => typeof scope !== 'string' || scope.length === 0)) {
    throw new PolicyConfigurationError(
      `Policy "${name}" has an invalid (empty/non-string) scope entry`,
    );
  }
  if (
    typeof policy.maxExpiresInSeconds !== 'number' ||
    !Number.isFinite(policy.maxExpiresInSeconds) ||
    policy.maxExpiresInSeconds <= 0 ||
    policy.maxExpiresInSeconds > MAX_EXPIRES_IN_SECONDS_CEILING
  ) {
    throw new PolicyConfigurationError(
      `Policy "${name}" maxExpiresInSeconds must be a positive number <= ${MAX_EXPIRES_IN_SECONDS_CEILING}`,
    );
  }
}
