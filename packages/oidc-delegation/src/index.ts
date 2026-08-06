// Errors
export { OidcDelegationError, type OidcDelegationErrorCategory } from './errors';
// Module
export { OidcDelegationModule } from './oidc-delegation.module';
// Service
export { OidcDelegationService, type OidcDelegationServiceDeps } from './oidc-delegation.service';
export { PolicyConfigurationError, PolicyNotFoundError } from './policy-registry';
// Providers
export { KeycloakTokenExchangeProvider } from './providers/keycloak-token-exchange.provider';
// Types
export type {
  DelegatedAccessToken,
  DelegationPolicyConfig,
  ExchangeDelegatedTokenInput,
  OidcDelegationClient,
  OidcDelegationModuleOptions,
  TokenExchangeProvider,
  TokenExchangeProviderParams,
  TokenExchangeProviderResult,
} from './types';
