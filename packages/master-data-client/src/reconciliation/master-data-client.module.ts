import { DynamicModule, Module } from '@nestjs/common';
import type { MasterDataClientModuleOptions } from '../types';
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
      ],
      exports: [MasterDataReconciliationService],
    };
  }
}
