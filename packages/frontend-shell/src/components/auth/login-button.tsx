'use client';

import { useTransition } from 'react';

import { Button } from '../ui/button.js';
import { FieldError, FieldGroup } from '../ui/field.js';

export interface LoginButtonProps {
  /** Triggers the app's own next-auth `signIn()` server action — each app has its own
   * Keycloak client credentials, so this can't be baked into the shared component. */
  readonly onSignIn: () => void | Promise<void>;
  readonly label?: string;
  readonly pendingLabel?: string;
  readonly errorMessage?: string;
}

/** Redirect-style OIDC sign-in button (dev_docs/framework/035 §4.1) — wraps the
 * loading/error presentation every app's login page needs around next-auth's
 * `signIn()`, which throws a framework redirect rather than resolving normally. */
export function LoginButton({
  onSignIn,
  label = 'Sign in with Keycloak',
  pendingLabel = 'Redirecting...',
  errorMessage,
}: LoginButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await onSignIn();
    });
  }

  return (
    <FieldGroup>
      {errorMessage && <FieldError>{errorMessage}</FieldError>}
      <Button type="button" className="w-full" disabled={isPending} onClick={handleClick}>
        {isPending ? pendingLabel : label}
      </Button>
    </FieldGroup>
  );
}
