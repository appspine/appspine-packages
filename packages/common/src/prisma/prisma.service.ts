import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { BasePrismaClient } from './prisma-client';

@Injectable()
export class PrismaService extends BasePrismaClient implements OnModuleInit, OnModuleDestroy {
  // biome-ignore lint/suspicious/noExplicitAny: index signature lets callers access dynamic model delegates (e.g. this.prisma.user)
  [key: string]: any;

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
