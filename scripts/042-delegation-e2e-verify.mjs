#!/usr/bin/env node

// Real Keycloak, real build-artifact integration verification for
// 042-oidc-delegation-package-plan.md T-17000: exercises the actual published shape of
// both @appspine/oidc-delegation and @appspine/auth's delegated crypto/claim verifier
// (their compiled dist/ output, not source) against the real dev-infra Keycloak realm.
//
// Deliberately stops before DelegatedPrincipalMapperService: that class's constructor
// parameter is typed as JwtVerifierService, and TypeScript's emitDecoratorMetadata (needed
// for Nest DI) makes the compiled JS eagerly require('../jwt-verifier.service') purely to
// resolve that type at runtime -- which transitively requires @appspine/common's
// PrismaService, which resolves `@prisma/client` from `process.cwd()`'s generated client
// (see packages/common/src/prisma/prisma-client.ts). That generated client only exists for
// a real consuming app with its own merged Prisma schema; 042 deliberately does not stand
// one up (see plan §3.2 non-goals). DelegatedPrincipalMapperService's own branching logic
// (provisioning: 'never' | 'jit') is unit-tested separately in
// delegated-principal-mapper.service.spec.ts against a fixture JwtVerifierService and does
// not depend on Keycloak-specific behavior, so it does not need real-Keycloak
// re-verification here.
//
// What this DOES verify with real, compiled artifacts and a real IdP: the outbound exchange
// succeeds end-to-end, and the inbound crypto/claim verifier accepts the result and reports
// exactly the claims plan §9 requires (subject preserved as the original human user,
// audience/source client/scope/TTL correct) -- the security-critical part of T-17000.
//
// Usage: node scripts/042-delegation-e2e-verify.mjs
// Config: KC_BASE_URL is required; the remaining variables default to the checked-in dev realm.
//   KC_REALM, WIKI_SECRET, WIKI_DELEGATION_SECRET, WIKI_USER_PASSWORD

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
const WIKI_USER_EMAIL = 'wiki-user@appspine-dev.local';

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

const trustProfile = {
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

function redactedClaimSummary(claims) {
  return {
    issuer: claims.issuer,
    audience: claims.audience,
    sourceClientId: claims.sourceClientId,
    scopes: claims.scopes,
    // externalSubject intentionally omitted from stdout — audit-only per plan §13.
  };
}

async function main() {
  console.log('--- T-17000: real wiki -> approve delegation, real build artifacts ---');

  const subjectToken = await getWikiUserSubjectToken();
  console.log('[1/4] obtained wiki-user subject token via wiki client');

  const delegated = await oidcDelegation.exchange({ subjectToken, policy: POLICY_NAME });
  console.log(
    `[2/4] outbound exchange succeeded via @appspine/oidc-delegation: tokenType=${delegated.tokenType} expiresInSeconds=${delegated.expiresInSeconds}`,
  );

  const verifier = new DelegatedJwtVerifierService();
  const verified = await verifier.verify(delegated.accessToken, trustProfile);
  console.log(
    `[3/4] inbound verification succeeded via @appspine/auth: ${JSON.stringify(redactedClaimSummary(verified.claims))}`,
  );

  const assertions = [
    ['delegated token audience is approve', verified.claims.audience === 'approve'],
    [
      'delegated token source client is wiki-delegation (the delegation-only client, not wiki itself)',
      verified.claims.sourceClientId === 'wiki-delegation',
    ],
    [
      'delegated token carries the submit scope',
      verified.claims.scopes.includes('approve:knowledge-document-change:submit'),
    ],
    [
      'subject is preserved as the original human user (wiki-user), not a service account identity',
      verified.email === WIKI_USER_EMAIL,
    ],
    [
      'email is reported as verified (required for identity mapping)',
      verified.emailVerified === true,
    ],
  ];

  const ttlContractHolds = delegated.expiresInSeconds === 120;
  console.log(`[4/4] delegated token TTL is exactly 120 seconds: ${ttlContractHolds}`);
  assertions.push([
    'Keycloak TTL, outbound maximum, and inbound maximum all agree at 120 seconds',
    ttlContractHolds,
  ]);

  let allPass = true;
  for (const [label, pass] of assertions) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
    if (!pass) allPass = false;
  }

  console.log(
    '\nNote: local-principal mapping (DelegatedPrincipalMapperService) is intentionally not',
    'exercised here — see the file header comment. It is unit-tested separately.',
  );
  console.log(allPass ? '\nT-17000: PASS' : '\nT-17000: FAIL');
  return allPass;
}

main()
  .then((allPass) => {
    process.exitCode = allPass ? 0 : 1;
  })
  .catch((error) => {
    console.error('T-17000: FAIL (unexpected error)', error.message);
    process.exitCode = 1;
  });
