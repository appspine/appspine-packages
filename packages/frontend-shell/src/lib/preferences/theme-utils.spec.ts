// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveThemeMode, subscribeToSystemTheme } from './theme-utils.js';

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(media));
  return {
    fire: (nowMatches: boolean) => {
      for (const listener of listeners) listener({ matches: nowMatches } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveThemeMode', () => {
  it('resolves "dark" and "light" directly without touching matchMedia', () => {
    expect(resolveThemeMode('dark')).toBe('dark');
    expect(resolveThemeMode('light')).toBe('light');
  });

  it('resolves "system" to "dark" when the OS prefers dark', () => {
    stubMatchMedia(true);
    expect(resolveThemeMode('system')).toBe('dark');
  });

  it('resolves "system" to "light" when the OS prefers light', () => {
    stubMatchMedia(false);
    expect(resolveThemeMode('system')).toBe('light');
  });
});

describe('subscribeToSystemTheme', () => {
  it('invokes the callback with the resolved mode when the OS preference changes', () => {
    const { fire } = stubMatchMedia(false);
    const onChange = vi.fn();
    subscribeToSystemTheme(onChange);

    fire(true);
    expect(onChange).toHaveBeenCalledWith('dark');

    fire(false);
    expect(onChange).toHaveBeenCalledWith('light');
  });

  it('returns an unsubscribe function that removes the listener', () => {
    const { fire, listenerCount } = stubMatchMedia(false);
    const onChange = vi.fn();
    const unsubscribe = subscribeToSystemTheme(onChange);
    expect(listenerCount()).toBe(1);

    unsubscribe();
    expect(listenerCount()).toBe(0);

    fire(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is a no-op when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const onChange = vi.fn();
    const unsubscribe = subscribeToSystemTheme(onChange);
    expect(() => unsubscribe()).not.toThrow();
  });
});
