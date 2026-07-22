import { describe, expect, it } from 'vitest';
import type { MirrorRecord } from '../types';
import { reconcileEntity } from './reconciliation.service';

type OrgMirror = MirrorRecord & {
  name: string;
  syncedAt: Date;
};

function createModel(initial: OrgMirror[] = []) {
  const rows = new Map(initial.map((row) => [row.sourceId, row]));
  return {
    rows,
    model: {
      async findMany() {
        return Array.from(rows.values());
      },
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
          throw new Error('Not found');
        }
        rows.delete(args.where.sourceId);
        return existing;
      },
    },
  };
}

describe('reconcileEntity', () => {
  it('adds missing source rows, updates stale rows, and deletes removed rows', async () => {
    const oldSyncedAt = new Date('2026-07-21T00:00:00.000Z');
    const { model, rows } = createModel([
      { sourceId: 'unit-1', name: 'Old Finance', seq: 1n, syncedAt: oldSyncedAt },
      { sourceId: 'unit-removed', name: 'Removed', seq: 1n, syncedAt: oldSyncedAt },
    ]);

    const result = await reconcileEntity(
      model,
      [
        { sourceId: 'unit-1', seq: 2n, payload: { name: 'Finance' } },
        { sourceId: 'unit-2', seq: 1n, payload: { name: 'HR' } },
      ],
      (item) => ({
        sourceId: item.sourceId,
        name: String(item.payload.name),
        seq: item.seq,
        syncedAt: new Date('2026-07-22T00:00:00.000Z'),
      }),
    );

    expect(result).toEqual({ upserted: 2, deleted: 1, skipped: 0 });
    expect(rows.get('unit-1')?.name).toBe('Finance');
    expect(rows.get('unit-2')?.name).toBe('HR');
    expect(rows.has('unit-removed')).toBe(false);
  });
});
