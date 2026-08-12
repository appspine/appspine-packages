import { canonicalJson, sha256Digest } from './canonical';
import type { ContractKind, ContractManifest } from './types';

export type ContractManifestInput = Omit<ContractManifest, 'digest'> & { digest?: string };

export function createContractManifest(input: ContractManifestInput): ContractManifest {
  const unsigned = {
    contractId: input.contractId,
    version: input.version,
    kind: input.kind,
    canonicalSource: input.canonicalSource,
    artifacts: sortRecord(input.artifacts),
  };
  return { ...unsigned, digest: sha256Digest(unsigned) };
}

export function verifyContractManifest(manifest: ContractManifest): boolean {
  return createContractManifest(manifest).digest === manifest.digest;
}

export function canonicalManifestInput(input: ContractManifestInput): string {
  return canonicalJson({
    contractId: input.contractId,
    version: input.version,
    kind: input.kind,
    canonicalSource: input.canonicalSource,
    artifacts: sortRecord(input.artifacts),
  });
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

export function isContractKind(value: unknown): value is ContractKind {
  return value === 'capability' || value === 'binding';
}
