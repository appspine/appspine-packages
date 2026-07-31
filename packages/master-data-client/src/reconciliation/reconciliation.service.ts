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
      // Each entity is reconciled independently — one entity's listFetcher() failing (a
      // transient/partial fetch against the master-data app) must not skip every other
      // entity for the rest of this pass. A shared listFetcher backend means "the next
      // pass will catch it" (reconcileEntity's own delete-sweep guard) doesn't hold if the
      // failure recurs across passes; per-entity isolation at least keeps unrelated
      // entities converging.
      for (const entity of this.options.entities) {
        try {
          const sourceItems = await entity.listFetcher();
          await reconcileEntity(
            entity.name,
            entity.model,
            sourceItems,
            (item) => ({
              ...entity.mapper(item),
              seq: item.seq,
              syncedAt: new Date(),
            }),
            this.logger,
          );
        } catch (error) {
          this.logger.error(`Reconciliation failed for "${entity.name}": ${errorMessage(error)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function reconcileEntity<TMirror extends MirrorRecord>(
  name: string,
  model: ReconciliationMirrorModel<TMirror>,
  sourceItems: MasterDataListItem<Record<string, unknown>>[],
  mapSourceItem: (item: MasterDataListItem<Record<string, unknown>>) => TMirror,
  logger: Logger,
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

  // Guard: an empty source list almost always means a transient/partial fetch problem
  // (listFetcher resolved with [] instead of throwing) rather than the master-data app
  // genuinely having zero records left. Skip the delete-sweep in that case so a flaky
  // fetch can't silently wipe every local Mirror row; a real deletion is still caught by
  // the webhook-driven delete event path, and the next successful reconciliation pass
  // will still catch anything actually missed. Only warn when the guard actually does
  // something — an empty source list against an already-empty Mirror isn't a skip, it's
  // a no-op, and logging it as a skip would be misleading.
  if (sourceItems.length === 0 && existing.length > 0) {
    logger.warn(
      `listFetcher for "${name}" returned an empty list; skipping the delete-sweep for this ` +
        'reconciliation pass to avoid wiping the Mirror on a transient/partial fetch.',
    );
    return { upserted, deleted: 0, skipped };
  }

  for (const row of existing) {
    if (!sourceIds.has(row.sourceId)) {
      await model.delete({ where: { sourceId: row.sourceId } });
      deleted += 1;
    }
  }

  return { upserted, deleted, skipped };
}
