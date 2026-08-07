#!/usr/bin/env node

// Real Keycloak, real build-artifact negative matrix for 042-oidc-delegation-package-plan.md
// T-17010 — extends T-17000 (042-delegation-e2e-verify.mjs) by re-verifying the SAME real
// delegated token against deliberately wrong DelegatedOidcTrustProfile values, using the
// actual compiled @appspine/auth delegated verifier (not source, not a synthetic JWT).
//
// The Keycloak-side negative matrix (wrong requester, wrong audience, unknown/upscoped
// scope, ID token, refresh token, chat-token-via-wiki-delegation) is already covered against
// real Keycloak by dev-infra/scripts/token-exchange-smoke.mjs (T-16720) and is not repeated
// here. This script covers the inbound-verifier-side checks T-16720 can't reach, since it
// only calls the Keycloak token endpoint directly and never runs @appspine/auth's verifier.
//
// Usage: node scripts/042-delegation-e2e-negative-verify.mjs

import { DelegatedJwtVerifierService } from '../packages/auth/dist/delegated/delegated-jwt-verifier.service.js';
import { OidcDelegationService } from '../packages/oidc-delegation/dist/index.js';

const KC_BASE_URL = process.env.KC_BASE_URL;
if (!KC_BASE_URL) throw new Error('KC_BASE_URL is required');
const ALLOW_INSECURE_HTTP = new URL(KC_BASE_URL).protocol === 'http:';
const KC_REALM = process.env.KC_REALM ?? 'appspine-dev';
const WIKI_SECRET = process.env.WIKI_SECRET ?? 'dev-secret-wiki';
const WIKI_DELEGATION_SECRET = process.env.WIKI_DELEGATION_SECRET ?? 'dev-secret-wiki-delegation';
const WIKI_USER_PASSWORD = process.env.WIKI_USER_PASSWORD ?? 'wiki-user-pass';

process.env.OIDC_JWKS_URL = `${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/certs`;
const ISSUER = `${KC_BASE_URL}/realms/${KC_REALM}`;
const POLICY_NAME = 'submit-knowledge-document-change';

const oidcDelegation = new OidcDelegationService({
  provider: 'keycloak',
  tokenEndpoint: `${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`,
  sourceClientId: 'wiki-delegation',
  sourceClientSecret: WIKI_DELEGATION_SECRET,
  subjectTokenIssuerClientId: 'wiki',
  allowInsecureTokenEndpoint: ALLOW_INSECURE_HTTP,
  policies: {
    [POLICY_NAME]: {
      targetAudience: 'approve',
      requestedScopes: ['approve:knowledge-document-change:submit'],
      maxExpiresInSeconds: 120,
    },
  },
});

async function getWikiUserSubjectToken() {
  const res = await fetch(`${KC_BASE_URL}/realms/${KC_REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'wiki',
      client_secret: WIKI_SECRET,
      username: 'wiki-user',
      password: WIKI_USER_PASSWORD,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error('failed to obtain wiki-user subject token');
  }
  return body.access_token;
}

function baseProfile() {
  return {
    expectedIssuer: ISSUER,
    allowInsecureHttp: ALLOW_INSECURE_HTTP,
    requiredAudience: 'approve',
    additionalAllowedAudiences: [],
    allowedClientIds: ['wiki-delegation'],
    requiredScopes: ['approve:knowledge-document-change:submit'],
    delegationScopeNamespace: 'approve:',
    maxTokenAgeSeconds: 120,
    clockToleranceSeconds: 10,
    provisioning: 'never',
  };
}

async function main() {
  console.log('--- T-17010: real delegated token, inbound-verifier-side negative matrix ---');

  const subjectToken = await getWikiUserSubjectToken();
  const delegated = await oidcDelegation.exchange({ subjectToken, policy: POLICY_NAME });
  console.log('[setup] obtained one real delegated token, reused for every case below\n');

  const verifier = new DelegatedJwtVerifierService();

  const cases = [
    {
      name: 'wrong expectedIssuer',
      profile: { ...baseProfile(), expectedIssuer: 'https://attacker.example' },
    },
    {
      name: 'wrong requiredAudience (not approve)',
      profile: { ...baseProfile(), requiredAudience: 'chat' },
    },
    {
      name: 'allowedClientIds does not include wiki-delegation',
      profile: { ...baseProfile(), allowedClientIds: ['some-other-client'] },
    },
    {
      name: 'requiredScopes asks for a scope the token does not have',
      profile: { ...baseProfile(), requiredScopes: ['approve:admin:full-control'] },
    },
    {
      name: 'maxTokenAgeSeconds tighter than the real token TTL (60s vs real 120s)',
      profile: { ...baseProfile(), maxTokenAgeSeconds: 60 },
    },
    {
      name: 'clockToleranceSeconds so small it cannot offset any real clock drift (0s, still same-process so should still pass)',
      profile: { ...baseProfile(), clockToleranceSeconds: 0 },
      expectSuccess: true, // sanity control: 0 tolerance alone must not break a same-process check
    },
  ];

  let allPass = true;
  for (const { name, profile, expectSuccess } of cases) {
    const outcome = await verifier
      .verify(delegated.accessToken, profile)
      .then(() => 'success')
      .catch(() => 'rejected');
    const wantedOutcome = expectSuccess ? 'success' : 'rejected';
    const pass = outcome === wantedOutcome;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} -> ${outcome} (expected ${wantedOutcome})`);
    if (!pass) allPass = false;
  }

  // Positive control: the unmodified base profile must still succeed against this same
  // token — proves the negative cases above are actually testing the field they claim to,
  // not some unrelated always-failing configuration.
  const controlOutcome = await verifier
    .verify(delegated.accessToken, baseProfile())
    .then(() => 'success')
    .catch(() => 'rejected');
  const controlPass = controlOutcome === 'success';
  console.log(
    `${controlPass ? 'PASS' : 'FAIL'}  positive control: unmodified base profile -> ${controlOutcome} (expected success)`,
  );
  if (!controlPass) allPass = false;

  console.log(allPass ? '\nT-17010: PASS' : '\nT-17010: FAIL');
  return allPass;
}

main()
  .then((allPass) => {
    process.exitCode = allPass ? 0 : 1;
  })
  .catch((error) => {
    console.error('T-17010: FAIL (unexpected error)', error.message);
    process.exitCode = 1;
  });
