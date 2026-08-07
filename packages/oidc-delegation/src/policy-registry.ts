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
    super('Unknown delegation policy');
    this.name = 'PolicyNotFoundError';
  }
}

export class PolicyRegistry {
  private readonly policies: ReadonlyMap<string, DelegationPolicyConfig>;

  constructor(policies: Record<string, DelegationPolicyConfig>) {
    if (!policies || typeof policies !== 'object' || Array.isArray(policies)) {
      throw new PolicyConfigurationError('Delegation policies must be configured as an object');
    }
    const entries = Object.entries(policies);
    if (entries.length === 0) {
      throw new PolicyConfigurationError('At least one delegation policy must be configured');
    }

    for (const [name, policy] of entries) {
      validatePolicy(name, policy);
    }

    this.policies = new Map(
      entries.map(([name, policy]) => [
        name,
        Object.freeze({
          ...policy,
          requestedScopes: Object.freeze([...policy.requestedScopes]),
        }),
      ]),
    );
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
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(name)) {
    throw new PolicyConfigurationError(
      'Policy name must use lowercase letters, numbers, and hyphens',
    );
  }
  if (!policy || typeof policy !== 'object') {
    throw new PolicyConfigurationError(`Policy "${name}" configuration must be an object`);
  }
  if (
    typeof policy.targetAudience !== 'string' ||
    policy.targetAudience.length === 0 ||
    /\s/.test(policy.targetAudience)
  ) {
    throw new PolicyConfigurationError(`Policy "${name}" must have a non-empty targetAudience`);
  }
  if (!Array.isArray(policy.requestedScopes) || policy.requestedScopes.length === 0) {
    throw new PolicyConfigurationError(`Policy "${name}" must have at least one requestedScope`);
  }
  if (
    policy.requestedScopes.some(
      (scope) => typeof scope !== 'string' || scope.length === 0 || /\s/.test(scope),
    )
  ) {
    throw new PolicyConfigurationError(
      `Policy "${name}" has an invalid (empty/non-string) scope entry`,
    );
  }
  if (new Set(policy.requestedScopes).size !== policy.requestedScopes.length) {
    throw new PolicyConfigurationError(`Policy "${name}" has duplicate requestedScopes`);
  }
  if (policy.requestedScopes.includes('offline_access')) {
    throw new PolicyConfigurationError(`Policy "${name}" must not request offline_access`);
  }
  if (
    typeof policy.maxExpiresInSeconds !== 'number' ||
    !Number.isInteger(policy.maxExpiresInSeconds) ||
    policy.maxExpiresInSeconds <= 0 ||
    policy.maxExpiresInSeconds > MAX_EXPIRES_IN_SECONDS_CEILING
  ) {
    throw new PolicyConfigurationError(
      `Policy "${name}" maxExpiresInSeconds must be a positive integer <= ${MAX_EXPIRES_IN_SECONDS_CEILING}`,
    );
  }
}
