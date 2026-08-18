/**
 * Reserved Phase 1 public boundary. Phase 3 adds the login contribution without changing the
 * package subpath consumers and tooling already validate.
 */
export interface OidcAuthFrontendContribution {
  readonly kind: 'appspine.oidc-auth.frontend';
}
