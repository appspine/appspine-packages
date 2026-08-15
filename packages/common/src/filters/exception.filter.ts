import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Trace ids end up in a single-line log record and in the JSON error body, so only an opaque,
 * bounded token is acceptable. An attacker-supplied `X-Request-Id: abc\n[ERROR] ...` would
 * otherwise forge whole log lines (log-line injection) in every app that mounts this filter.
 * Anything not matching this pattern is discarded in favour of a fresh UUID rather than
 * sanitized, so no attacker-chosen substring survives into the log at all.
 */
const SAFE_TRACE_ID = /^[A-Za-z0-9._-]{1,64}$/;

function resolveTraceId(req: Request): string {
  const requestId = (req as Request & { id?: unknown }).id;
  if (typeof requestId === 'string' && SAFE_TRACE_ID.test(requestId)) return requestId;

  const header = req.headers['x-request-id'];
  // Express yields string[] for a duplicated header — only a single well-formed value counts.
  if (typeof header === 'string' && SAFE_TRACE_ID.test(header)) return header;

  return randomUUID();
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const body = response as { message?: unknown };
        if (Array.isArray(body.message)) {
          // ZodValidationPipe throws BadRequestException(issues) (an array); always
          // expose a string `message` and put the structured array under `details`.
          message = 'Validation failed';
          details = body.message;
        } else if (typeof body.message === 'string') {
          message = body.message;
        } else {
          message = exception.message;
        }
      } else {
        message = exception.message;
      }
    }

    const traceId = resolveTraceId(req);

    // Nest's own would-be default logging never runs — this filter fully handles the response
    // itself instead of rethrowing, and nestjs-pino's access-log line never sees `exception`, only
    // the resulting status code. Without this, a 500 leaves no server-side trace of what failed.
    // Logs the raw exception message, not the sanitized client-facing `message` above (which is
    // hardcoded to "Internal server error" for non-HttpExceptions precisely to avoid leaking
    // internals to the client) — the log is server-side only, so it should have the real detail.
    const logMessage = exception instanceof Error ? exception.message : String(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${traceId}] ${req.method} ${req.url} -> ${status}: ${logMessage}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.debug(`[${traceId}] ${req.method} ${req.url} -> ${status}: ${logMessage}`);
    }

    res.status(status).json({
      statusCode: status,
      message,
      ...(details !== undefined && { details }),
      traceId,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
