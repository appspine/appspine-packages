import { validateOidcDelegationModuleOptions } from './module-options-validation';
import type { OidcDelegationModuleOptions } from './types';

export const OIDC_DELEGATION_CONFIG = Symbol.for('appspine.oidc-delegation.config');

export const oidcDelegationConfigSchema = {
  parse(input: unknown): OidcDelegationModuleOptions {
    const options = input as OidcDelegationModuleOptions;
    validateOidcDelegationModuleOptions(options);
    return options;
  },
};

export type OidcDelegationConfig = OidcDelegationModuleOptions;
