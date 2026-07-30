'use client';

import { useState, useTransition } from 'react';

import { Button } from '../ui/button.js';
import { FieldError, FieldGroup } from '../ui/field.js';

// next-auth's signIn() completes a successful redirect by throwing Next.js's internal
// "NEXT_REDIRECT" error (identified by its `digest`, per Next's own redirect-error
// implementation) — this must propagate untouched or navigation silently breaks.
// Reimplemented inline (rather than importing `unstable_rethrow` from
// `next/navigation`) because this package's `moduleResolution: NodeNext` can't resolve
// that subpath against Next.js's own empty `exports` map.
function isNextRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

export interface LoginButtonProps {
  /** Triggers the app's own next-auth `signIn()` server action — each app has its own
   * Keycloak client credentials, so this can't be baked into the shared component. */
  readonly onSignIn: () => void | Promise<void>;
  /** Required, not defaulted — every app must supply its own translated (en + zh-TW)
   * copy, otherwise a mis-configured app would silently render English regardless of
   * locale. */
  readonly label: string;
  readonly pendingLabel: string;
  readonly errorMessage?: string;
  /** Shown when `onSignIn` rejects with something other than next-auth's internal
   * redirect (e.g. a network failure reaching the IdP before the redirect starts).
   * Optional because this is a rare, genuinely new failure surface — falls back to an
   * English default rather than forcing every app to add a translation key for it. */
  readonly unexpectedErrorMessage?: string;
}

/** Redirect-style OIDC sign-in button (dev_docs/framework/035 §4.1) — wraps the
 * loading/error presentation every app's login page needs around next-auth's
 * `signIn()`, which throws a framework redirect rather than resolving normally. */
export function LoginButton({
  onSignIn,
  label,
  pendingLabel,
  errorMessage,
  unexpectedErrorMessage = 'Something went wrong. Please try again.',
}: LoginButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [clientError, setClientError] = useState<string | null>(null);

  function handleClick() {
    setClientError(null);
    startTransition(async () => {
      try {
        await onSignIn();
      } catch (error) {
        if (isNextRedirectError(error)) {
          throw error;
        }
        // A genuine failure (e.g. can't reach the IdP) — surface it instead of
        // silently resetting the button to idle with no explanation.
        setClientError(unexpectedErrorMessage);
      }
    });
  }

  const displayedError = errorMessage ?? clientError;

  return (
    <FieldGroup>
      {displayedError && <FieldError>{displayedError}</FieldError>}
      <Button type="button" className="w-full" disabled={isPending} onClick={handleClick}>
        {isPending ? pendingLabel : label}
      </Button>
    </FieldGroup>
  );
}
