import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
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

    const requestId = (req as Request & { id?: string }).id;

    res.status(status).json({
      statusCode: status,
      message,
      ...(details !== undefined && { details }),
      traceId: requestId || req.headers['x-request-id'] || randomUUID(),
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
