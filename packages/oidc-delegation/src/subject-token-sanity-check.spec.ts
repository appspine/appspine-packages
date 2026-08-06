import { describe, expect, it } from 'vitest';
import {
  assertSubjectTokenBelongsToSourceClient,
  SubjectTokenSanityCheckError,
} from './subject-token-sanity-check';

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'at+jwt' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

describe('assertSubjectTokenBelongsToSourceClient', () => {
  it('passes when azp matches the source client id', () => {
    const token = fakeJwt({ azp: 'wiki-delegation', sub: 'user-1' });
    expect(() => assertSubjectTokenBelongsToSourceClient(token, 'wiki-delegation')).not.toThrow();
  });

  it('falls back to client_id when azp is absent (RFC 9068 providers)', () => {
    const token = fakeJwt({ client_id: 'wiki-delegation', sub: 'user-1' });
    expect(() => assertSubjectTokenBelongsToSourceClient(token, 'wiki-delegation')).not.toThrow();
  });

  it('rejects a token whose azp belongs to a different client — the core laundering guard', () => {
    // Simulates T-16610: a token issued by `chat` presented to the `wiki-delegation` source client.
    const token = fakeJwt({ azp: 'chat', sub: 'user-1' });
    expect(() => assertSubjectTokenBelongsToSourceClient(token, 'wiki-delegation')).toThrow(
      SubjectTokenSanityCheckError,
    );
  });

  it('rejects a token with neither azp nor client_id', () => {
    const token = fakeJwt({ sub: 'user-1' });
    expect(() => assertSubjectTokenBelongsToSourceClient(token, 'wiki-delegation')).toThrow(
      SubjectTokenSanityCheckError,
    );
  });

  it('rejects a non-string azp (claim pollution)', () => {
    const token = fakeJwt({ azp: ['wiki-delegation'], sub: 'user-1' });
    expect(() => assertSubjectTokenBelongsToSourceClient(token, 'wiki-delegation')).toThrow(
      SubjectTokenSanityCheckError,
    );
  });

  it('rejects a malformed (non-3-part) token', () => {
    expect(() => assertSubjectTokenBelongsToSourceClient('not-a-jwt', 'wiki-delegation')).toThrow(
      SubjectTokenSanityCheckError,
    );
  });

  it('rejects a token whose payload is not valid base64url JSON', () => {
    expect(() =>
      assertSubjectTokenBelongsToSourceClient(
        'aaa.not-valid-base64url-json.bbb',
        'wiki-delegation',
      ),
    ).toThrow(SubjectTokenSanityCheckError);
  });

  it('never throws a message containing the token itself', () => {
    const token = fakeJwt({ azp: 'chat', sub: 'super-secret-subject-identifier' });
    try {
      assertSubjectTokenBelongsToSourceClient(token, 'wiki-delegation');
      expect.unreachable('expected an error to be thrown');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(token);
      expect(message).not.toContain('super-secret-subject-identifier');
    }
  });
});
