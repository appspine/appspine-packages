import { describe, expect, it } from 'vitest';

import { assertSafeDestination } from './destination-policy';

describe('SSRF-safe destination policy', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.4',
    '169.254.169.254',
    '100.64.0.1',
    '100.100.100.200',
    '198.18.0.1',
    '192.168.1.10',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    'ff02::1',
  ])('rejects blocked address %s', async (address) => {
    const host = address.includes(':') ? `[${address}]` : address;
    await expect(
      assertSafeDestination(`https://${host}`, { resolve: async () => [address] }),
    ).rejects.toThrow('blocked');
  });

  it('rejects credentials and non-HTTPS production destinations', async () => {
    await expect(
      assertSafeDestination('https://user:pass@example.invalid', {
        production: true,
        allowedHosts: ['example.invalid'],
        resolve: async () => ['203.0.113.10'],
      }),
    ).rejects.toThrow('credentials');
  });

  it('requires every resolved address to be safe and allowlisted', async () => {
    await expect(
      assertSafeDestination('https://events.example.invalid', {
        allowedHosts: ['events.example.invalid'],
        resolve: async () => ['203.0.113.10', '127.0.0.1'],
      }),
    ).rejects.toThrow('blocked');
    await expect(
      assertSafeDestination('https://other.example.invalid', {
        allowedHosts: ['events.example.invalid'],
        resolve: async () => ['203.0.113.10'],
      }),
    ).rejects.toThrow('allowlisted');
  });
});
