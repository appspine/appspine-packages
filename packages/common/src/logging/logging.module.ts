import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        redact: {
          // Consuming apps enable CORS with `credentials: true`, so session cookies ride on
          // every request — without the cookie/set-cookie entries below a full session token
          // lands in plaintext access logs. `x-appspine-signature` covers the webhook HMAC and
          // `proxy-authorization` the upstream-proxy credential; both are bearer-equivalent.
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-api-key"]',
            'req.headers["proxy-authorization"]',
            'req.headers["x-appspine-signature"]',
            'res.headers["set-cookie"]',
            'body.password',
            'body.token',
            'body.secret',
            'body.accessToken',
            'body.refreshToken',
            'body.subjectToken',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: true,
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
