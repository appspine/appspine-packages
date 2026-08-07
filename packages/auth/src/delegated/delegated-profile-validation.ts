import type { DelegatedOidcTrustProfile, ResolvedDelegatedOidcTrustProfile } from './types';

const MAX_TOKEN_AGE_SECONDS = 3600;

export function validateDelegatedProfiles(
  profiles: Record<string, DelegatedOidcTrustProfile>,
): Readonly<Record<string, ResolvedDelegatedOidcTrustProfile>> {
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    throw new Error('DelegatedAuthModule.forFeature() profiles must be configured as an object');
  }
  const entries = Object.entries(profiles);
  if (entries.length === 0) {
    throw new Error('DelegatedAuthModule.forFeature() requires at least one profile');
  }
  const resolvedEntries = entries.map(([name, profile]) => {
    validateProfile(name, profile);
    return [
      name,
      Object.freeze({
        ...profile,
        additionalAllowedAudiences: Object.freeze([...profile.additionalAllowedAudiences]),
        allowedClientIds: Object.freeze([...profile.allowedClientIds]),
        requiredScopes: Object.freeze([...profile.requiredScopes]),
        provisioning: profile.provisioning ?? 'never',
      }),
    ] as const;
  });
  return Object.freeze(Object.fromEntries(resolvedEntries));
}

export function validateDelegatedJwksUrl(
  jwksUri: string | undefined,
  profiles: Readonly<Record<string, ResolvedDelegatedOidcTrustProfile>>,
): void {
  if (!jwksUri) {
    throw new Error('OIDC_JWKS_URL is required when DelegatedAuthModule is enabled');
  }
  const url = parseAbsoluteUrl(jwksUri, 'OIDC_JWKS_URL');
  const allProfilesAllowHttp = Object.values(profiles).every(
    (profile) => profile.allowInsecureHttp === true,
  );
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allProfilesAllowHttp)) {
    throw new Error(
      'OIDC_JWKS_URL must use HTTPS unless every delegated profile explicitly allows HTTP',
    );
  }
}

function validateProfile(name: string, profile: DelegatedOidcTrustProfile): void {
  const prefix = `Delegated profile "${name}"`;

  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(name)) {
    throw new Error('Delegated profile names must use lowercase letters, numbers, and hyphens');
  }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`${prefix} configuration must be an object`);
  }
  const issuer = parseAbsoluteUrl(profile.expectedIssuer, `${prefix} expectedIssuer`);
  if (
    issuer.protocol !== 'https:' &&
    !(issuer.protocol === 'http:' && profile.allowInsecureHttp === true)
  ) {
    throw new Error(`${prefix} expectedIssuer must use HTTPS unless HTTP is explicitly allowed`);
  }
  assertIdentifier(profile.requiredAudience, `${prefix} requiredAudience`);
  assertStringArray(
    profile.additionalAllowedAudiences,
    `${prefix} additionalAllowedAudiences`,
    true,
  );
  assertStringArray(profile.allowedClientIds, `${prefix} allowedClientIds`, false);
  assertStringArray(profile.requiredScopes, `${prefix} requiredScopes`, false);
  if (profile.additionalAllowedAudiences.includes(profile.requiredAudience)) {
    throw new Error(`${prefix} must not repeat requiredAudience in additionalAllowedAudiences`);
  }
  assertIdentifier(profile.delegationScopeNamespace, `${prefix} delegationScopeNamespace`);
  if (!profile.delegationScopeNamespace.endsWith(':')) {
    throw new Error(`${prefix} delegationScopeNamespace must end with a colon`);
  }
  if (profile.requiredScopes.some((scope) => !scope.startsWith(profile.delegationScopeNamespace))) {
    throw new Error(`${prefix} requiredScopes must be inside delegationScopeNamespace`);
  }
  if (
    !Number.isInteger(profile.maxTokenAgeSeconds) ||
    profile.maxTokenAgeSeconds <= 0 ||
    profile.maxTokenAgeSeconds > MAX_TOKEN_AGE_SECONDS
  ) {
    throw new Error(
      `${prefix} maxTokenAgeSeconds must be a positive integer <= ${MAX_TOKEN_AGE_SECONDS}`,
    );
  }
  if (!Number.isInteger(profile.clockToleranceSeconds) || profile.clockToleranceSeconds < 0) {
    throw new Error(`${prefix} clockToleranceSeconds must be a non-negative integer`);
  }
  if (profile.clockToleranceSeconds >= profile.maxTokenAgeSeconds) {
    throw new Error(`${prefix} clockToleranceSeconds must be smaller than maxTokenAgeSeconds`);
  }
  if (
    profile.provisioning !== undefined &&
    profile.provisioning !== 'never' &&
    profile.provisioning !== 'jit'
  ) {
    throw new Error(`${prefix} provisioning must be 'never' or 'jit'`);
  }
}

function assertStringArray(
  value: unknown,
  name: string,
  allowEmpty: boolean,
): asserts value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${name} must be ${allowEmpty ? 'an array' : 'a non-empty array'}`);
  }
  for (const entry of value) {
    assertIdentifier(entry, `${name} entry`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${name} must not contain duplicates`);
  }
}

function assertIdentifier(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || /\s/.test(value)) {
    throw new Error(`${name} must be a non-empty string without whitespace`);
  }
}

function parseAbsoluteUrl(value: unknown, name: string): URL {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be configured`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain embedded credentials`);
  }
  return url;
}
