import type {
  MasterDataEventRecord,
  MasterDataMirrorMapper,
  MasterDataSyncHandler,
  MasterDataSyncHandlerOptions,
  MirrorModel,
  MirrorRecord,
} from './types';

function normalizeEventTypes(eventTypes: string | string[]): Set<string> {
  return new Set(Array.isArray(eventTypes) ? eventTypes : [eventTypes]);
}

export function toComparableSeq(seq: bigint | number | string): bigint {
  return typeof seq === 'bigint' ? seq : BigInt(seq);
}

function resolvePayload<TPayload extends Record<string, unknown>>(
  event: MasterDataEventRecord<TPayload>,
): TPayload | null {
  return event.after ?? event.payload ?? null;
}

export function createMasterDataSyncHandler<
  TPayload extends Record<string, unknown>,
  TMirror extends MirrorRecord,
>(
  model: MirrorModel<TMirror>,
  mapper: MasterDataMirrorMapper<TPayload, TMirror>,
  options: MasterDataSyncHandlerOptions,
): MasterDataSyncHandler<MasterDataEventRecord<TPayload>> {
  const changedEventTypes = normalizeEventTypes(options.changedEventTypes);
  const deletedEventTypes = normalizeEventTypes(options.deletedEventTypes);
  const now = options.now ?? (() => new Date());

  return {
    async handle(event) {
      if (deletedEventTypes.has(event.eventType)) {
        const existing = await model.findUnique({ where: { sourceId: event.aggregateId } });
        if (!existing || toComparableSeq(existing.seq) >= toComparableSeq(event.seq)) {
          return 'skipped';
        }
        try {
          await model.delete({ where: { sourceId: event.aggregateId } });
        } catch (error) {
          if (isKnownMissingRecordError(error)) {
            return 'skipped';
          }
          throw error;
        }
        return 'deleted';
      }

      if (!changedEventTypes.has(event.eventType)) {
        return 'ignored';
      }

      const existing = await model.findUnique({ where: { sourceId: event.aggregateId } });
      if (existing && toComparableSeq(existing.seq) >= toComparableSeq(event.seq)) {
        return 'skipped';
      }

      const payload = resolvePayload(event);
      if (!payload) {
        throw new Error(
          `Master data event "${event.eventType}" did not include an after/payload object.`,
        );
      }

      const mapped = mapper(payload, event);
      const data = { ...mapped, seq: event.seq, syncedAt: now() } as unknown as TMirror;

      await model.upsert({
        where: { sourceId: event.aggregateId },
        create: data,
        update: data,
      });
      return 'upserted';
    },
  };
}

function isKnownMissingRecordError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2025'
  );
}
