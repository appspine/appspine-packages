import type { DelegatedOidcTrustProfile } from './types';

export function validateDelegatedProfiles(
  profiles: Record<string, DelegatedOidcTrustProfile>,
): void {
  const entries = Object.entries(profiles);
  if (entries.length === 0) {
    throw new Error('DelegatedAuthModule.forFeature() requires at least one profile');
  }
  for (const [name, profile] of entries) {
    validateProfile(name, profile);
  }
}

function validateProfile(name: string, profile: DelegatedOidcTrustProfile): void {
  const prefix = `Delegated profile "${name}"`;

  if (!profile.expectedIssuer) {
    throw new Error(`${prefix} is missing expectedIssuer`);
  }
  if (!profile.requiredAudience) {
    throw new Error(`${prefix} is missing requiredAudience`);
  }
  if (!Array.isArray(profile.allowedClientIds) || profile.allowedClientIds.length === 0) {
    throw new Error(`${prefix} must have at least one allowedClientId`);
  }
  if (!Array.isArray(profile.requiredScopes) || profile.requiredScopes.length === 0) {
    throw new Error(`${prefix} must have at least one requiredScope`);
  }
  if (!profile.delegationScopeNamespace) {
    throw new Error(`${prefix} is missing delegationScopeNamespace`);
  }
  if (!Number.isFinite(profile.maxTokenAgeSeconds) || profile.maxTokenAgeSeconds <= 0) {
    throw new Error(`${prefix} maxTokenAgeSeconds must be a positive number`);
  }
  if (!Number.isFinite(profile.clockToleranceSeconds) || profile.clockToleranceSeconds < 0) {
    throw new Error(`${prefix} clockToleranceSeconds must be >= 0`);
  }
  if (profile.clockToleranceSeconds >= profile.maxTokenAgeSeconds) {
    throw new Error(`${prefix} clockToleranceSeconds must be smaller than maxTokenAgeSeconds`);
  }
  if (profile.provisioning !== 'never' && profile.provisioning !== 'jit') {
    throw new Error(`${prefix} provisioning must be 'never' or 'jit'`);
  }
}
