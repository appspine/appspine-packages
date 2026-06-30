import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        redact: {
          paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'body.password'],
          censor: '[REDACTED]',
        },
        autoLogging: true,
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
