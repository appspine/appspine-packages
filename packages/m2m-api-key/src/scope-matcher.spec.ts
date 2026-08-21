import { SCOPE_MATCHER } from '@appspine/plugin-api';
import { describe, expect, it } from 'vitest';
import { matchScope } from './guards/scope.guard';
import { ScopeMatcherService } from './scope-matcher.service';

describe('ScopeMatcherService & matchScope', () => {
  const matcher = new ScopeMatcherService();

  it('matches global wildcard * against any required scope', () => {
    expect(matcher.matches(['*'], 'users:read')).toBe(true);
    expect(matcher.matches(['*'], 'events:write')).toBe(true);
    expect(matcher.matches(['*'], 'mcp:call')).toBe(true);
  });

  it('matches module wildcard against specific action in that module', () => {
    expect(matcher.matches(['users:*'], 'users:read')).toBe(true);
    expect(matcher.matches(['users:*'], 'users:write')).toBe(true);
    expect(matcher.matches(['users:*'], 'roles:read')).toBe(false);
  });

  it('matches exact scope', () => {
    expect(matcher.matches(['users:read', 'roles:write'], 'users:read')).toBe(true);
    expect(matcher.matches(['users:read', 'roles:write'], 'roles:write')).toBe(true);
    expect(matcher.matches(['users:read', 'roles:write'], 'users:write')).toBe(false);
  });

  it('rejects when granted list is empty', () => {
    expect(matcher.matches([], 'users:read')).toBe(false);
  });

  it('binds to SCOPE_MATCHER symbol with identical behavior', () => {
    expect(SCOPE_MATCHER).toBe(Symbol.for('appspine.scope-matcher'));
    expect(matchScope(['data:read'], 'data:read')).toBe(
      matcher.matches(['data:read'], 'data:read'),
    );
  });
});
