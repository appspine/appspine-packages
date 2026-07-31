import type { ModuleMetadata } from '@nestjs/common';

export type MasterDataEventRecord<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = {
  seq: bigint | number | string;
  eventType: string;
  aggregateId: string;
  after?: TPayload | null;
  before?: TPayload | null;
  payload?: TPayload | null;
  createdAt?: Date;
};

export type MirrorRecord = {
  sourceId: string;
  seq: bigint | number | string;
  // Set by the factory (sync-handler.factory.ts) / reconciliation service on every
  // upsert, not by callers — kept off both mapper Omit types below so implementations
  // don't need to (and can't accidentally) provide their own value.
  syncedAt: Date;
};

export type MirrorModel<TMirror extends MirrorRecord> = {
  findUnique(args: { where: { sourceId: string } }): Promise<TMirror | null>;
  upsert(args: {
    where: { sourceId: string };
    create: TMirror;
    update: Partial<TMirror>;
  }): Promise<TMirror>;
  delete(args: { where: { sourceId: string } }): Promise<TMirror>;
};

export type MasterDataMirrorMapper<
  TPayload extends Record<string, unknown>,
  TMirror extends MirrorRecord,
> = (
  payload: TPayload,
  event: MasterDataEventRecord<TPayload>,
) => Omit<TMirror, 'seq' | 'syncedAt'>;

export type MasterDataSyncHandlerOptions = {
  changedEventTypes: string | string[];
  deletedEventTypes: string | string[];
  now?: () => Date;
};

export type MasterDataSyncHandler<TEvent extends MasterDataEventRecord = MasterDataEventRecord> = {
  handle(event: TEvent): Promise<'upserted' | 'deleted' | 'skipped' | 'ignored'>;
};

export type ReconciliationMirrorModel<TMirror extends MirrorRecord> = MirrorModel<TMirror> & {
  findMany(): Promise<TMirror[]>;
};

export type MasterDataListItem<TPayload extends Record<string, unknown>> = {
  sourceId: string;
  seq: bigint | number | string;
  payload: TPayload;
};

export type MasterDataReconciliationEntity<
  TPayload extends Record<string, unknown>,
  TMirror extends MirrorRecord,
> = {
  name: string;
  model: ReconciliationMirrorModel<TMirror>;
  listFetcher: () => Promise<MasterDataListItem<TPayload>[]>;
  mapper: (item: MasterDataListItem<TPayload>) => Omit<TMirror, 'seq' | 'syncedAt'>;
};

export type MasterDataClientModuleOptions = {
  intervalMs?: number;
  autoStart?: boolean;
  entities: MasterDataReconciliationEntity<Record<string, unknown>, MirrorRecord>[];
};

export type MasterDataClientModuleAsyncOptions = {
  imports?: ModuleMetadata['imports'];
  // `inject`'s providers can't be generically tied to `useFactory`'s parameter types without
  // the caller supplying an explicit tuple type argument NestJS's own forRootAsync() callers
  // never do in practice — this mirrors ConfigModule/TypeOrmModule's own async-options shape,
  // not a shortcut. `never[]` here would look stricter but is a lie: it makes `useFactory`
  // structurally uncallable with any real argument (a function with a `never[]` rest param
  // trivially accepts anything, including a factory whose params don't match `inject` at all),
  // so it caught nothing.
  // biome-ignore lint/suspicious/noExplicitAny: see comment above.
  inject?: any[];
  useFactory: (
    // biome-ignore lint/suspicious/noExplicitAny: see the class-level comment on `inject` above.
    ...args: any[]
  ) => MasterDataClientModuleOptions | Promise<MasterDataClientModuleOptions>;
};
