import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { toComparableSeq } from '../sync-handler.factory';
import type {
  MasterDataClientModuleOptions,
  MasterDataListItem,
  MirrorRecord,
  ReconciliationMirrorModel,
} from '../types';

export const MASTER_DATA_CLIENT_OPTIONS = 'MASTER_DATA_CLIENT_OPTIONS';

@Injectable()
export class MasterDataReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MasterDataReconciliationService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @Inject(MASTER_DATA_CLIENT_OPTIONS)
    private readonly options: Required<
      Pick<MasterDataClientModuleOptions, 'intervalMs' | 'autoStart'>
    > &
      Pick<MasterDataClientModuleOptions, 'entities'>,
  ) {}

  onModuleInit(): void {
    if (this.options.autoStart) {
      this.start();
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.reconcileAll();
    }, this.options.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async reconcileAll(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (const entity of this.options.entities) {
        await reconcileEntity(entity.model, await entity.listFetcher(), (item) => ({
          ...entity.mapper(item),
          seq: item.seq,
          syncedAt: new Date(),
        }));
      }
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.running = false;
    }
  }
}

export async function reconcileEntity<TMirror extends MirrorRecord>(
  model: ReconciliationMirrorModel<TMirror>,
  sourceItems: MasterDataListItem<Record<string, unknown>>[],
  mapSourceItem: (item: MasterDataListItem<Record<string, unknown>>) => TMirror,
): Promise<{ upserted: number; deleted: number; skipped: number }> {
  const existing = await model.findMany();
  const sourceIds = new Set(sourceItems.map((item) => item.sourceId));
  let upserted = 0;
  let deleted = 0;
  let skipped = 0;

  for (const item of sourceItems) {
    const current = existing.find((row) => row.sourceId === item.sourceId);
    if (current && toComparableSeq(current.seq) >= toComparableSeq(item.seq)) {
      skipped += 1;
      continue;
    }
    const data = mapSourceItem(item);
    await model.upsert({
      where: { sourceId: item.sourceId },
      create: data,
      update: data,
    });
    upserted += 1;
  }

  for (const row of existing) {
    if (!sourceIds.has(row.sourceId)) {
      await model.delete({ where: { sourceId: row.sourceId } });
      deleted += 1;
    }
  }

  return { upserted, deleted, skipped };
}
