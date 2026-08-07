import { Logger, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DelegatedIdentityMappingError } from './delegated-identity-mapping.error';
import { DelegatedSecurityEventLogger } from './delegated-security-event-logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DelegatedSecurityEventLogger', () => {
  it('rate-limits rejection logs and never includes the underlying error message', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const logger = new DelegatedSecurityEventLogger();

    for (let i = 0; i < 25; i++) {
      logger.recordRejection('submit', new UnauthorizedException('attacker-controlled detail'));
    }

    expect(warn).toHaveBeenCalledTimes(20);
    expect(warn.mock.calls.flat().join('\n')).not.toContain('attacker-controlled detail');
    logger.onModuleDestroy();
    expect(warn).toHaveBeenCalledTimes(21);
    expect(warn.mock.calls.at(-1)?.[0]).toContain('"suppressed":5');
  });

  it('uses a separate de-identified category for identity mapping failures', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const logger = new DelegatedSecurityEventLogger();
    logger.recordRejection(
      'submit',
      new DelegatedIdentityMappingError('no account for person@example.com'),
    );
    expect(warn.mock.calls[0][0]).toContain('identity_mapping_failed');
    expect(warn.mock.calls[0][0]).not.toContain('person@example.com');
    logger.onModuleDestroy();
  });
});
