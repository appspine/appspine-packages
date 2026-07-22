import { describe, expect, it } from 'vitest';
import { createMasterDataSyncHandler } from './sync-handler.factory';
import type { MirrorRecord } from './types';

type OrgMirror = MirrorRecord & {
  name: string;
  syncedAt: Date;
};

function createModel(initial: OrgMirror[] = []) {
  const rows = new Map(initial.map((row) => [row.sourceId, row]));
  return {
    rows,
    model: {
      async findUnique(args: { where: { sourceId: string } }) {
        return rows.get(args.where.sourceId) ?? null;
      },
      async upsert(args: {
        where: { sourceId: string };
        create: OrgMirror;
        update: Partial<OrgMirror>;
      }) {
        const next = rows.has(args.where.sourceId)
          ? ({ ...rows.get(args.where.sourceId), ...args.update } as OrgMirror)
          : args.create;
        rows.set(args.where.sourceId, next);
        return next;
      },
      async delete(args: { where: { sourceId: string } }) {
        const existing = rows.get(args.where.sourceId);
        if (!existing) {
          const error = new Error('Not found') as Error & { code: string };
          error.code = 'P2025';
          throw error;
        }
        rows.delete(args.where.sourceId);
        return existing;
      },
    },
  };
}

const fixedNow = new Date('2026-07-22T00:00:00.000Z');

describe('createMasterDataSyncHandler', () => {
  it('upserts changed events', async () => {
    const { model, rows } = createModel();
    const handler = createMasterDataSyncHandler(
      model,
      (payload) => ({
        sourceId: String(payload.id),
        name: String(payload.name),
        syncedAt: fixedNow,
      }),
      {
        changedEventTypes: 'OrgUnitChanged',
        deletedEventTypes: 'OrgUnitDeleted',
        now: () => fixedNow,
      },
    );

    await expect(
      handler.handle({
        aggregateId: 'unit-1',
        eventType: 'OrgUnitChanged',
        seq: 10n,
        after: { id: 'unit-1', name: 'Finance' },
      }),
    ).resolves.toBe('upserted');
    expect(rows.get('unit-1')).toMatchObject({ name: 'Finance', seq: 10n, syncedAt: fixedNow });
  });

  it('skips older seq events', async () => {
    const { model, rows } = createModel([
      { sourceId: 'unit-1', name: 'Newer', seq: 10n, syncedAt: fixedNow },
    ]);
    const handler = createMasterDataSyncHandler(
      model,
      (payload) => ({
        sourceId: String(payload.id),
        name: String(payload.name),
        syncedAt: fixedNow,
      }),
      {
        changedEventTypes: 'OrgUnitChanged',
        deletedEventTypes: 'OrgUnitDeleted',
        now: () => fixedNow,
      },
    );

    await expect(
      handler.handle({
        aggregateId: 'unit-1',
        eventType: 'OrgUnitChanged',
        seq: 9n,
        after: { id: 'unit-1', name: 'Older' },
      }),
    ).resolves.toBe('skipped');
    expect(rows.get('unit-1')?.name).toBe('Newer');
  });

  it('hard deletes deleted events', async () => {
    const { model, rows } = createModel([
      { sourceId: 'unit-1', name: 'Finance', seq: 10n, syncedAt: fixedNow },
    ]);
    const handler = createMasterDataSyncHandler(
      model,
      (payload) => ({
        sourceId: String(payload.id),
        name: String(payload.name),
        syncedAt: fixedNow,
      }),
      { changedEventTypes: 'OrgUnitChanged', deletedEventTypes: 'OrgUnitDeleted' },
    );

    await expect(
      handler.handle({ aggregateId: 'unit-1', eventType: 'OrgUnitDeleted', seq: 11n }),
    ).resolves.toBe('deleted');
    expect(rows.has('unit-1')).toBe(false);
  });

  it('treats deleting a missing mirror row as idempotent', async () => {
    const { model } = createModel();
    const handler = createMasterDataSyncHandler(
      model,
      (payload) => ({
        sourceId: String(payload.id),
        name: String(payload.name),
        syncedAt: fixedNow,
      }),
      { changedEventTypes: 'OrgUnitChanged', deletedEventTypes: 'OrgUnitDeleted' },
    );

    await expect(
      handler.handle({ aggregateId: 'missing', eventType: 'OrgUnitDeleted', seq: 11n }),
    ).resolves.toBe('skipped');
  });
});
