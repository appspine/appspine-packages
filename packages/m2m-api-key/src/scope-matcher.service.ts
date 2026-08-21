import type { ScopeMatcherPort } from '@appspine/plugin-api';
import { Injectable } from '@nestjs/common';
import { matchScope } from './guards/scope.guard';

/**
 * `appspine.scope-matcher` capability service (051 PL4-03).
 *
 * Implements the minimal `ScopeMatcherPort` contract so other capabilities (such as
 * `@appspine/metadata-schema` or `@appspine/mcp-server`) can inject `SCOPE_MATCHER`
 * without directly depending on `@appspine/m2m-api-key`'s guards or controllers.
 */
@Injectable()
export class ScopeMatcherService implements ScopeMatcherPort {
  matches(scopes: string[], required: string): boolean {
    return matchScope(scopes, required);
  }
}
