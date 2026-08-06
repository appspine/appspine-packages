// Allowed fields only — see 042-oidc-delegation-package-plan.md §13: no token, secret,
// full claims, token endpoint body, email, or subject may ever reach a log event. Because
// this type is the only thing loggers receive, that rule is enforced structurally rather
// than by a redaction/scrubbing pass.
export type OidcDelegationLogEvent = {
  provider: string;
  policy: string;
  category: string;
  latencyMs: number;
  correlationId?: string;
};

export interface OidcDelegationLogger {
  log(event: OidcDelegationLogEvent): void;
}

export class ConsoleOidcDelegationLogger implements OidcDelegationLogger {
  log(event: OidcDelegationLogEvent): void {
    console.log('[oidc-delegation]', JSON.stringify(event));
  }
}
