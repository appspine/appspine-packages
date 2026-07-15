import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from './exception.filter';

interface MockRequest {
  url: string;
  headers: Record<string, string>;
  id?: string;
}

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

  it('should include timestamp in ISO format', () => {
    const req = { url: '/test-path', headers: {} };
    const { host, json } = mockHost(req);
    const exception = new Error('boom');

    filter.catch(exception, host);

    const timestamp = json.mock.calls[0][0].timestamp;
    expect(timestamp).toBeDefined();
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
