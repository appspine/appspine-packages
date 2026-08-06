import { SetMetadata } from '@nestjs/common';

export const DELEGATED_PROFILE_KEY = 'appspine:delegatedProfile';

/**
 * Marks an endpoint as accepting a delegated (Token Exchange) token under the named
 * profile. `DelegatedAuthGuard` refuses to authenticate any request whose handler doesn't
 * carry this decorator — there is deliberately no global "accept delegated tokens" switch
 * (see 042-oidc-delegation-package-plan.md §9 / §17.1).
 */
export const DelegatedProfile = (profileName: string) =>
  SetMetadata(DELEGATED_PROFILE_KEY, profileName);
