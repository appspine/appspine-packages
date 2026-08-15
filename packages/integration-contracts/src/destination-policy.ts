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
    return isBlockedIpv4Value(((a * 256 + b) * 256 + c) * 256 + d);
  }
  if (isIP(normalized) === 6) {
    // Expand to the full 8-group form first. Matching on the *textual* form let a caller
    // spell loopback as `0:0:0:0:0:0:0:1` (or ULA as `fc00:0:0:0:0:0:0:1` written with
    // leading zeroes) and slip past a `=== '::1'` / `startsWith('fc')` check entirely.
    const groups = expandIpv6(normalized);
    if (!groups) return true;

    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible — classify by the embedded IPv4.
    const first5AllZero = groups.slice(0, 5).every((group) => group === 0);
    if (first5AllZero && groups[5] === 0xffff) return isBlockedIpv4Value(embeddedIpv4(groups));
    if (first5AllZero && groups[5] === 0) {
      const value = embeddedIpv4(groups);
      // `::` (unspecified) and `::1` (loopback) both land here.
      return value <= 1 || isBlockedIpv4Value(value);
    }
    // NAT64 well-known prefix 64:ff9b::/96 and 64:ff9b:1::/48 tunnel to an embedded IPv4.
    if (groups[0] === 0x0064 && groups[1] === 0xff9b) return true;

    const [head, second] = groups;
    return (
      (head & 0xfe00) === 0xfc00 || // fc00::/7   unique-local
      (head & 0xffc0) === 0xfe80 || // fe80::/10  link-local (incl. the IPv6 metadata address)
      (head & 0xff00) === 0xff00 || // ff00::/8   multicast
      head === 0x2002 || // 2002::/16  6to4 — tunnels to an arbitrary embedded IPv4
      (head === 0x2001 && second === 0x0000) || // 2001::/32   Teredo — same tunnelling problem
      (head === 0x2001 && second === 0x0db8) // 2001:db8::/32 documentation
    );
  }
  return true;
}

/** Splits an already-`isIP`-validated IPv6 literal into its 8 numeric groups. */
function expandIpv6(value: string): number[] | undefined {
  let text = value;

  // Trailing dotted-quad form (::ffff:127.0.0.1) — fold the IPv4 tail into two groups.
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/u.exec(text);
  if (dotted) {
    const octets = dotted[2].split('.').map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255))
      return undefined;
    const high = (octets[0] << 8) | octets[1];
    const low = (octets[2] << 8) | octets[3];
    text = `${dotted[1]}${high.toString(16)}:${low.toString(16)}`;
  }

  // Drop a zone id (fe80::1%eth0) before parsing.
  text = text.split('%')[0];

  const [left, right, ...rest] = text.split('::');
  if (rest.length > 0) return undefined;
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)));
  const head = parse(left);
  const groups =
    right === undefined
      ? head
      : [...head, ...Array(8 - head.length - parse(right).length).fill(0), ...parse(right)];
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff))
    return undefined;
  return groups;
}

function embeddedIpv4(groups: number[]): number {
  return groups[6] * 65536 + groups[7];
}

function isBlockedIpv4Value(value: number): boolean {
  const a = (value >>> 24) & 0xff;
  const b = (value >>> 16) & 0xff;
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
    inRange(0xc0586300, 0xc05863ff) ||
    inRange(0xc6120000, 0xc613ffff) ||
    inRange(0xc6336400, 0xc63364ff) ||
    inRange(0xcb007100, 0xcb0071ff) ||
    a >= 224
  );
}
