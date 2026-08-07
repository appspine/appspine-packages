import type { OnModuleDestroy } from '@nestjs/common';
import { OidcDelegationError } from './errors';
import { validateOidcDelegationModuleOptions } from './module-options-validation';
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
  TokenExchangeProviderResult,
} from './types';

const DEFAULT_MAX_EXCHANGES_PER_MINUTE_PER_POLICY = 60;

export type OidcDelegationServiceDeps = {
  provider?: TokenExchangeProvider;
  logger?: OidcDelegationLogger;
};

export class OidcDelegationService implements OidcDelegationClient, OnModuleDestroy {
  private readonly policyRegistry: PolicyRegistry;
  private readonly provider: TokenExchangeProvider;
  private readonly throttle: OutboundThrottle;
  private readonly securityLog: SecurityEventLog;
  private readonly logger: OidcDelegationLogger;
  private readonly subjectTokenIssuerClientId: string;
  private disposed = false;

  constructor(options: OidcDelegationModuleOptions, deps: OidcDelegationServiceDeps = {}) {
    validateOidcDelegationModuleOptions(options);
    this.policyRegistry = new PolicyRegistry(options.policies);
    this.subjectTokenIssuerClientId = options.subjectTokenIssuerClientId;
    this.logger = deps.logger ?? new ConsoleOidcDelegationLogger();
    this.provider =
      deps.provider ??
      new KeycloakTokenExchangeProvider({
        tokenEndpoint: options.tokenEndpoint,
        sourceClientId: options.sourceClientId,
        sourceClientSecret: options.sourceClientSecret,
        requestTimeoutMs: options.requestTimeoutMs,
        allowInsecureTokenEndpoint: options.allowInsecureTokenEndpoint,
      });
    this.throttle = new OutboundThrottle(
      options.maxExchangesPerMinutePerPolicy ?? DEFAULT_MAX_EXCHANGES_PER_MINUTE_PER_POLICY,
    );
    this.securityLog = new SecurityEventLog(this.logger);
  }

  async exchange(input: ExchangeDelegatedTokenInput): Promise<DelegatedAccessToken> {
    const startedAt = Date.now();
    let policyForLog = 'unregistered';

    try {
      if (!input || typeof input.policy !== 'string') {
        throw new OidcDelegationError('policy_not_found', 'delegation policy was not provided');
      }
      const policy = this.policyRegistry.resolve(input.policy);
      policyForLog = input.policy;

      try {
        assertSubjectTokenBelongsToSourceClient(
          input.subjectToken,
          this.subjectTokenIssuerClientId,
        );
      } catch {
        // Not a copy of the underlying decode error's message — see subject-token-sanity-check.ts,
        // this must never end up describing token contents in a log line.
        throw new OidcDelegationError(
          'invalid_subject_token',
          'subject token failed the source-client sanity check',
        );
      }

      this.throttle.checkAndConsume(input.policy);

      let result: TokenExchangeProviderResult;
      try {
        result = await this.provider.exchange({
          subjectToken: input.subjectToken,
          targetAudience: policy.targetAudience,
          requestedScopes: policy.requestedScopes,
        });
      } catch (error) {
        const normalized = normalizeError(error);
        if (normalized.category === 'provider_unavailable') {
          this.throttle.recordProviderFailure(input.policy);
        }
        throw normalized;
      }

      assertProviderResult(result, policy.maxExpiresInSeconds);
      this.throttle.recordSuccess(input.policy);

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

      this.securityLog.recordRejection({
        provider: 'keycloak',
        policy: policyForLog,
        category: normalized.category,
        latencyMs: Date.now() - startedAt,
      });

      throw normalized;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.throttle.dispose();
    this.securityLog.dispose();
  }

  onModuleDestroy(): void {
    this.dispose();
  }
}

function assertProviderResult(
  result: { accessToken: string; expiresInSeconds: number },
  maxExpiresInSeconds: number,
): void {
  if (
    !result ||
    typeof result.accessToken !== 'string' ||
    result.accessToken.length === 0 ||
    !Number.isInteger(result.expiresInSeconds) ||
    result.expiresInSeconds <= 0
  ) {
    throw new OidcDelegationError(
      'malformed_provider_response',
      'provider returned an invalid access token response',
    );
  }
  if (result.expiresInSeconds > maxExpiresInSeconds) {
    throw new OidcDelegationError(
      'policy_violation',
      'provider token lifetime exceeds the delegation policy maximum',
    );
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
