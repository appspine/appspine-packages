import { PrismaService } from '@appspine/common';
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaHealthIndicator,
    private prismaService: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // biome-ignore lint/suspicious/noExplicitAny: PrismaService delegates to consuming app's PrismaClient at runtime
      () => this.prisma.pingCheck('database', this.prismaService as any),
    ]);
  }
}
