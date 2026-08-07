import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

export type DestinationPolicyOptions = {
  production?: boolean;
  allowedHosts?: string[];
  resolve?: (hostname: string) => Promise<string[]>;
};

export type SafeDestination = {
  url: URL;
  addresses: string[];
};

export async function assertSafeDestination(
  urlValue: string,
  options: DestinationPolicyOptions = {},
): Promise<URL> {
  return (await resolveSafeDestination(urlValue, options)).url;
}

export async function resolveSafeDestination(
  urlValue: string,
  options: DestinationPolicyOptions = {},
): Promise<SafeDestination> {
  const url = parseDestinationUrl(urlValue);
  const host = url.hostname.toLowerCase().replace(/\.$/u, '');
  if (options.production && (!options.allowedHosts || options.allowedHosts.length === 0))
    throw new Error('Production webhook destinations require an explicit host allowlist');
  if (
    options.allowedHosts &&
    !options.allowedHosts.some((allowed) => normalizeHost(allowed) === host)
  )
    throw new Error(`Destination host is not allowlisted: ${host}`);
  if (options.production && url.protocol !== 'https:')
    throw new Error('Production webhook destinations must use HTTPS');
  if (url.username || url.password) throw new Error('Destination URL must not contain credentials');
  const addresses = isIP(host)
    ? [host]
    : await (
        options.resolve ??
        (async (hostname: string) =>
          (await dns.lookup(hostname, { all: true })).map((entry) => entry.address))
      )(host);
  if (addresses.length === 0) throw new Error(`Destination host did not resolve: ${host}`);
  for (const address of addresses)
    if (isBlockedAddress(address))
      throw new Error(`Destination resolves to a blocked address: ${address}`);
  return { url, addresses };
}

export function parseDestinationUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Destination URL must use HTTP or HTTPS');
  if (!url.hostname) throw new Error('Destination URL must include a hostname');
  return url;
}

function normalizeHost(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.$/u, '');
}

function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/gu, '');
  if (isIP(normalized) === 4) {
    const [a, b, c, d] = normalized.split('.').map(Number);
    const value = (((a * 256) + b) * 256 + c) * 256 + d;
    const inRange = (start: number, end: number) => value >= start && value <= end;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      inRange(0xc0000000, 0xc00000ff) ||
      inRange(0xc0000200, 0xc00002ff) ||
      inRange(0xc6120000, 0xc613ffff) ||
      inRange(0xc6336400, 0xc63364ff) ||
      inRange(0xcb007100, 0xcb0071ff) ||
      a >= 224
    );
  }
  if (isIP(normalized) === 6) {
    if (normalized.startsWith('::ffff:'))
      return isBlockedAddress(normalized.slice('::ffff:'.length));
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff')
    );
  }
  return true;
}
