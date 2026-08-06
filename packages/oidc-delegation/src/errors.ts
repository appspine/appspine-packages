// Error taxonomy from 042-oidc-delegation-package-plan.md §13. Consumers should branch on
// `category`, not on `message` (message is safe to log but not a stable API contract).
export type OidcDelegationErrorCategory =
  | 'invalid_subject_token'
  | 'policy_not_found'
  | 'policy_violation'
  | 'exchange_denied'
  | 'provider_unavailable'
  | 'malformed_provider_response';

const RETRYABLE_CATEGORIES: ReadonlySet<OidcDelegationErrorCategory> = new Set([
  'provider_unavailable',
]);

export class OidcDelegationError extends Error {
  readonly category: OidcDelegationErrorCategory;
  readonly retryable: boolean;

  constructor(category: OidcDelegationErrorCategory, message: string) {
    super(message);
    this.name = 'OidcDelegationError';
    this.category = category;
    this.retryable = RETRYABLE_CATEGORIES.has(category);
  }
}
