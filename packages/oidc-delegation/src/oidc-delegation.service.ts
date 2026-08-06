import { OidcDelegationError } from './errors';
import { ConsoleOidcDelegationLogger, type OidcDelegationLogger } from './observability/logger';
import { OutboundThrottle } from './observability/outbound-throttle';
import { SecurityEventLog } from './observability/security-event-log';
import { PolicyNotFoundError, PolicyRegistry } from './policy-registry';
import { KeycloakTokenExchangeProvider } from './providers/keycloak-token-exchange.provider';
import { assertSubjectTokenBelongsToSourceClient } from './subject-token-sanity-check';
import type {
  DelegatedAccessToken,
  ExchangeDelegatedTokenInput,
  OidcDelegationClient,
  OidcDelegationModuleOptions,
  TokenExchangeProvider,
} from './types';

const DEFAULT_MAX_EXCHANGES_PER_MINUTE_PER_POLICY = 60;

export type OidcDelegationServiceDeps = {
  provider?: TokenExchangeProvider;
  logger?: OidcDelegationLogger;
};

export class OidcDelegationService implements OidcDelegationClient {
  private readonly policyRegistry: PolicyRegistry;
  private readonly provider: TokenExchangeProvider;
  private readonly throttle: OutboundThrottle;
  private readonly securityLog: SecurityEventLog;
  private readonly logger: OidcDelegationLogger;
  private readonly sourceClientId: string;

  constructor(options: OidcDelegationModuleOptions, deps: OidcDelegationServiceDeps = {}) {
    this.policyRegistry = new PolicyRegistry(options.policies);
    this.sourceClientId = options.sourceClientId;
    this.logger = deps.logger ?? new ConsoleOidcDelegationLogger();
    this.provider =
      deps.provider ??
      new KeycloakTokenExchangeProvider({
        tokenEndpoint: options.tokenEndpoint,
        sourceClientId: options.sourceClientId,
        sourceClientSecret: options.sourceClientSecret,
        requestTimeoutMs: options.requestTimeoutMs,
      });
    this.throttle = new OutboundThrottle(
      options.maxExchangesPerMinutePerPolicy ?? DEFAULT_MAX_EXCHANGES_PER_MINUTE_PER_POLICY,
    );
    this.securityLog = new SecurityEventLog(this.logger);
  }

  async exchange(input: ExchangeDelegatedTokenInput): Promise<DelegatedAccessToken> {
    const startedAt = Date.now();

    try {
      const policy = this.policyRegistry.resolve(input.policy);

      try {
        assertSubjectTokenBelongsToSourceClient(input.subjectToken, this.sourceClientId);
      } catch {
        // Not a copy of the underlying decode error's message — see subject-token-sanity-check.ts,
        // this must never end up describing token contents in a log line.
        throw new OidcDelegationError(
          'invalid_subject_token',
          'subject token failed the source-client sanity check',
        );
      }

      this.throttle.checkAndConsume(input.policy);

      const result = await this.provider.exchange({
        subjectToken: input.subjectToken,
        targetAudience: policy.targetAudience,
        requestedScopes: policy.requestedScopes,
      });
      this.throttle.recordSuccess();

      this.logger.log({
        provider: 'keycloak',
        policy: input.policy,
        category: 'success',
        latencyMs: Date.now() - startedAt,
      });

      return {
        accessToken: result.accessToken,
        tokenType: 'Bearer',
        expiresInSeconds: result.expiresInSeconds,
      };
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.category === 'provider_unavailable') {
        this.throttle.recordProviderFailure();
      }

      this.securityLog.recordRejection({
        provider: 'keycloak',
        policy: input.policy,
        category: normalized.category,
        latencyMs: Date.now() - startedAt,
      });

      throw normalized;
    }
  }

  dispose(): void {
    this.throttle.dispose();
    this.securityLog.dispose();
  }
}

function normalizeError(error: unknown): OidcDelegationError {
  if (error instanceof OidcDelegationError) {
    return error;
  }
  if (error instanceof PolicyNotFoundError) {
    return new OidcDelegationError('policy_not_found', error.message);
  }
  return new OidcDelegationError(
    'malformed_provider_response',
    'unexpected error during token exchange',
  );
}
