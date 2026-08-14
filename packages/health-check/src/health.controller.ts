import { PrismaService } from '@appspine/common';
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

type PrismaPingClient = Parameters<PrismaHealthIndicator['pingCheck']>[1];

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
      // PrismaService delegates to the consuming app's generated client, while Terminus keeps
      // its compatible structural client union private. Keep the cast at this adapter boundary.
      () => this.prisma.pingCheck('database', this.prismaService as unknown as PrismaPingClient),
    ]);
  }
}
