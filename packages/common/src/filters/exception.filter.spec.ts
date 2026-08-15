import { type ArgumentsHost, BadRequestException, HttpException, Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from './exception.filter';

type MockRequest = {
  url: string;
  headers: Record<string, string>;
  id?: string;
};

function mockHost(req: MockRequest) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  };
  return { host: host as unknown as ArgumentsHost, status, json };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('should handle HttpException with string message', () => {
    const req = { url: '/test-path', headers: {} };
    const { host, status, json } = mockHost(req);
    const exception = new BadRequestException('bad thing');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'bad thing',
        path: '/test-path',
      }),
    );
    expect(json.mock.calls[0][0].details).toBeUndefined();
  });

  it('should handle HttpException with array message (validation failed)', () => {
    const req = { url: '/test-path', headers: {} };
    const { host, status, json } = mockHost(req);
    const issues = [{ path: ['name'], message: 'Required' }];
    const exception = new BadRequestException(issues);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        details: issues,
        path: '/test-path',
      }),
    );
  });

  it('should handle HttpException with non-object response', () => {
    const req = { url: '/test-path', headers: {} };
    const { host, status, json } = mockHost(req);
    // Custom HttpException with non-object response (which is atypical but handled)
    const exception = new HttpException('custom message', 418);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 418,
        message: 'custom message',
      }),
    );
  });

  it('should fallback to 500 Internal Server Error for non-HttpExceptions', () => {
    const req = { url: '/test-path', headers: {} };
    const { host, status, json } = mockHost(req);
    const exception = new Error('database boom');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
  });

  it('should prioritize traceId from req.id', () => {
    const req = {
      url: '/test-path',
      headers: { 'x-request-id': 'header-id' },
      id: 'req-id',
    };
    const { host, json } = mockHost(req);
    const exception = new Error('boom');

    filter.catch(exception, host);

    expect(json.mock.calls[0][0].traceId).toBe('req-id');
  });

  it('should fallback to traceId from x-request-id header if req.id is missing', () => {
    const req = {
      url: '/test-path',
      headers: { 'x-request-id': 'header-id' },
    };
    const { host, json } = mockHost(req);
    const exception = new Error('boom');

    filter.catch(exception, host);

    expect(json.mock.calls[0][0].traceId).toBe('header-id');
  });

  it('should generate a random traceId if req.id and x-request-id are missing', () => {
    const req = {
      url: '/test-path',
      headers: {},
    };
    const { host, json } = mockHost(req);
    const exception = new Error('boom');

    filter.catch(exception, host);

    const traceId = json.mock.calls[0][0].traceId;
    expect(traceId).toBeDefined();
    expect(typeof traceId).toBe('string');
    expect(traceId.length).toBeGreaterThan(0);
  });

  it('discards an x-request-id that could forge a log line, rather than reflecting it', () => {
    const forged = 'abc\n[Nest] 1 - ERROR [Auth] admin login succeeded';
    const req = { url: '/test-path', headers: { 'x-request-id': forged } };
    const { host, json } = mockHost(req);

    filter.catch(new Error('boom'), host);

    const traceId = json.mock.calls[0][0].traceId;
    expect(traceId).not.toContain('\n');
    expect(traceId).not.toContain('admin login succeeded');
    expect(traceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an over-long or non-token x-request-id and an array-valued one', () => {
    for (const value of ['x'.repeat(65), 'has spaces', '<script>'] as const) {
      const { host, json } = mockHost({ url: '/t', headers: { 'x-request-id': value } });
      filter.catch(new Error('boom'), host);
      expect(json.mock.calls[0][0].traceId).not.toBe(value);
    }
    const { host, json } = mockHost({
      url: '/t',
      headers: { 'x-request-id': ['a', 'b'] } as unknown as Record<string, string>,
    });
    filter.catch(new Error('boom'), host);
    expect(json.mock.calls[0][0].traceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should include timestamp in ISO format', () => {
    const req = { url: '/test-path', headers: {} };
    const { host, json } = mockHost(req);
    const exception = new Error('boom');

    filter.catch(exception, host);

    const timestamp = json.mock.calls[0][0].timestamp;
    expect(timestamp).toBeDefined();
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  describe('logging', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('logs a 500 at error level with the exception stack, so it is not lost once the response is sent', () => {
      const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const req = { url: '/test-path', headers: {} };
      const { host } = mockHost(req);
      const exception = new Error('database boom');

      filter.catch(exception, host);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [message, stack] = errorSpy.mock.calls[0] as [string, string];
      expect(message).toContain('database boom');
      expect(stack).toBe(exception.stack);
    });

    it('does not log a 4xx at error level (expected client errors, not a lost bug)', () => {
      const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      const req = { url: '/test-path', headers: {} };
      const { host } = mockHost(req);

      filter.catch(new BadRequestException('bad thing'), host);

      expect(errorSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledTimes(1);
    });
  });
});
