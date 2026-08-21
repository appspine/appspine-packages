import { MASTER_DATA_CLIENT } from '@appspine/plugin-api';
import { DynamicModule, Module } from '@nestjs/common';
import type { MasterDataClientModuleAsyncOptions, MasterDataClientModuleOptions } from '../types';
import {
  MASTER_DATA_CLIENT_OPTIONS,
  MasterDataReconciliationService,
} from './reconciliation.service';

const DEFAULT_INTERVAL_MS = 300000;

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules expose static factory methods.
export class MasterDataClientModule {
  static forRoot(options: MasterDataClientModuleOptions): DynamicModule {
    return {
      module: MasterDataClientModule,
      providers: [
        {
          provide: MASTER_DATA_CLIENT_OPTIONS,
          useValue: {
            intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
            autoStart: options.autoStart ?? true,
            entities: options.entities,
          },
        },
        MasterDataReconciliationService,
        {
          provide: MASTER_DATA_CLIENT,
          useExisting: MasterDataReconciliationService,
        },
      ],
      exports: [MasterDataReconciliationService, MASTER_DATA_CLIENT],
    };
  }

  static forRootAsync(options: MasterDataClientModuleAsyncOptions): DynamicModule {
    return {
      module: MasterDataClientModule,
      imports: options.imports,
      providers: [
        {
          provide: MASTER_DATA_CLIENT_OPTIONS,
          // biome-ignore lint/suspicious/noExplicitAny: matches options.useFactory's signature (see MasterDataClientModuleAsyncOptions.inject).
          useFactory: async (...args: any[]) => {
            const resolved = await options.useFactory(...args);
            return {
              intervalMs: resolved.intervalMs ?? DEFAULT_INTERVAL_MS,
              autoStart: resolved.autoStart ?? true,
              entities: resolved.entities,
            };
          },
          inject: options.inject,
        },
        MasterDataReconciliationService,
        {
          provide: MASTER_DATA_CLIENT,
          useExisting: MasterDataReconciliationService,
        },
      ],
      exports: [MasterDataReconciliationService, MASTER_DATA_CLIENT],
    };
  }
}
