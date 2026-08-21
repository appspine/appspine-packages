import type { MasterDataClientModuleOptions } from './types';

export const MASTER_DATA_CLIENT_CONFIG = Symbol.for('appspine.master-data-client.config');

export type MasterDataClientConfig = MasterDataClientModuleOptions & {
  endpoint?: string;
  apiKey?: string;
  masterDataApiKey?: string;
};

export class MasterDataClientConfigurationError extends Error {
  constructor(message: string) {
    super(`[MasterDataClient] Invalid configuration: ${message}`);
    this.name = 'MasterDataClientConfigurationError';
  }
}

export function validateMasterDataClientConfig(
  config: Partial<MasterDataClientConfig> | undefined | null,
): MasterDataClientConfig {
  if (config === undefined || config === null) {
    return {
      entities: [],
    };
  }

  if (typeof config !== 'object') {
    throw new MasterDataClientConfigurationError('Configuration must be an object');
  }

  if (config.intervalMs !== undefined) {
    if (
      typeof config.intervalMs !== 'number' ||
      config.intervalMs <= 0 ||
      !Number.isFinite(config.intervalMs)
    ) {
      throw new MasterDataClientConfigurationError('intervalMs must be a positive finite number');
    }
  }

  if (config.autoStart !== undefined && typeof config.autoStart !== 'boolean') {
    throw new MasterDataClientConfigurationError('autoStart must be a boolean');
  }

  if (config.entities !== undefined && !Array.isArray(config.entities)) {
    throw new MasterDataClientConfigurationError('entities must be an array');
  }

  if (config.endpoint !== undefined && typeof config.endpoint !== 'string') {
    throw new MasterDataClientConfigurationError('endpoint must be a string');
  }

  if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
    throw new MasterDataClientConfigurationError('apiKey must be a string');
  }

  if (config.masterDataApiKey !== undefined && typeof config.masterDataApiKey !== 'string') {
    throw new MasterDataClientConfigurationError('masterDataApiKey must be a string');
  }

  return {
    intervalMs: config.intervalMs,
    autoStart: config.autoStart,
    endpoint: config.endpoint,
    apiKey: config.apiKey ?? config.masterDataApiKey,
    masterDataApiKey: config.masterDataApiKey ?? config.apiKey,
    entities: config.entities ?? [],
  };
}

export const masterDataClientConfigSchema = {
  parse(input: unknown): MasterDataClientConfig {
    return validateMasterDataClientConfig(input as Partial<MasterDataClientConfig>);
  },
};
