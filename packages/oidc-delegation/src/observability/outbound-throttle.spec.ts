import { afterEach, describe, expect, it, vi } from 'vitest';
import { OutboundThrottle } from './outbound-throttle';

afterEach(() => {
  vi.useRealTimers();
});

describe('OutboundThrottle', () => {
  it('does not extend an open circuit when a blocked request arrives', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'));
    const throttle = new OutboundThrottle(60, 2, 30_000);

    throttle.recordProviderFailure('submit');
    throttle.recordProviderFailure('submit');
    expect(() => throttle.checkAndConsume('submit')).toThrow(/temporarily suspended/);

    vi.advanceTimersByTime(29_000);
    expect(() => throttle.checkAndConsume('submit')).toThrow(/temporarily suspended/);
    vi.advanceTimersByTime(1_001);
    expect(() => throttle.checkAndConsume('submit')).not.toThrow();
    throttle.dispose();
  });

  it('keeps circuits independent per policy', () => {
    const throttle = new OutboundThrottle(60, 1, 30_000);
    throttle.recordProviderFailure('submit');
    expect(() => throttle.checkAndConsume('submit')).toThrow(/temporarily suspended/);
    expect(() => throttle.checkAndConsume('withdraw')).not.toThrow();
    throttle.dispose();
  });
});
