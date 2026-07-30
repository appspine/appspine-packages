// next-auth's error query param values (https://authjs.dev/reference/core/errors) that
// warrant their own translated message, distinct from a generic fallback. Returns the
// translation *key* — each app owns its own message catalog (dev_docs/framework/035
// §4.1's pilot-first note: only framework-level shape is shared, not app-specific copy)
// — so callers do `t(mapAuthErrorKey(error))`.
export type AuthErrorKey = 'errorAccessDenied' | 'errorOAuthCallback' | 'errorDefault';

const KNOWN_ERROR_CODES: Record<string, AuthErrorKey> = {
  AccessDenied: 'errorAccessDenied',
  OAuthCallback: 'errorOAuthCallback',
};

export function mapAuthErrorKey(error: string | undefined): AuthErrorKey | undefined {
  if (!error) return undefined;
  return KNOWN_ERROR_CODES[error] ?? 'errorDefault';
}
