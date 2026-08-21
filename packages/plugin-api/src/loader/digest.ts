import { createHash } from 'node:crypto';
import { canonicalJsonString } from './canonicalize';

export const DIGEST_ALGORITHM = 'sha256';

function hash(input: string): string {
  return `${DIGEST_ALGORITHM}:${createHash(DIGEST_ALGORITHM).update(input, 'utf8').digest('hex')}`;
}

/**
 * Digest of the manifest alone. Stable across package version bumps, so "did this plugin's
 * declared contract change?" is answerable without diffing two versions by hand.
 */
export function manifestDigest(manifest: unknown): string {
  return hash(canonicalJsonString(manifest));
}

/**
 * Digest of the manifest *as resolved for a specific package version*. This is what goes in
 * `appspine.plugin-lock.json` (PL2-04): a version bump has to move it even when the manifest text
 * is byte-identical, otherwise a lockfile could claim a resolution it never verified.
 */
export function resolvedManifestDigest(input: {
  manifest: unknown;
  packageName: string;
  packageVersion: string;
}): string {
  return hash(
    canonicalJsonString({
      manifest: input.manifest,
      packageName: input.packageName,
      packageVersion: input.packageVersion,
    }),
  );
}

/** Constant-time-ish equality. Digests are public data, but comparing them sloppily invites bugs. */
export function digestsMatch(left: string | undefined, right: string | undefined): boolean {
  return typeof left === 'string' && typeof right === 'string' && left === right;
}
