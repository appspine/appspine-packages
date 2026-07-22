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
};

export type MirrorModel<TMirror extends MirrorRecord> = {
  findUnique(args: { where: { sourceId: string } }): Promise<TMirror | null>;
  upsert(args: {
    where: { sourceId: string };
    create: Omit<TMirror, never>;
    update: Partial<TMirror>;
  }): Promise<TMirror>;
  delete(args: { where: { sourceId: string } }): Promise<TMirror>;
};

export type MasterDataMirrorMapper<
  TPayload extends Record<string, unknown>,
  TMirror extends MirrorRecord,
> = (payload: TPayload, event: MasterDataEventRecord<TPayload>) => Omit<TMirror, 'seq'>;

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
  mapper: (item: MasterDataListItem<TPayload>) => Omit<TMirror, 'seq'>;
};

export type MasterDataClientModuleOptions = {
  intervalMs?: number;
  autoStart?: boolean;
  entities: MasterDataReconciliationEntity<Record<string, unknown>, MirrorRecord>[];
};
