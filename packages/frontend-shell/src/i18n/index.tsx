'use client';

import * as React from 'react';

export const locales = ['zh-TW', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh-TW';

interface I18nContextType {
  readonly locale: Locale;
  readonly messages: Record<string, Record<string, string>>;
}

const I18nContext = React.createContext<I18nContextType | null>(null);

interface I18nProviderProps {
  readonly locale: Locale;
  readonly messages: Record<Locale, Record<string, Record<string, string>>>;
  readonly children: React.ReactNode;
}

export function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  const currentMessages = React.useMemo(() => {
    return messages[locale] || {};
  }, [messages, locale]);

  const value = React.useMemo(
    () => ({
      locale,
      messages: currentMessages,
    }),
    [locale, currentMessages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error('useLocale must be used within an I18nProvider');
  }
  return context.locale;
}

/**
 * Consuming apps augment this via declaration merging (see frontend-shell's i18n docs) to give
 * useTranslations() real per-namespace literal key types instead of plain `string`:
 *
 * ```ts
 * import type { Messages } from "@/i18n/messages";
 * declare module "@appspine/frontend-shell" {
 *   interface FrontendShellMessages extends Messages {}
 * }
 * ```
 *
 * Left empty here — an app that hasn't augmented it (or frontend-shell's own build, which never
 * does) falls back to the untyped `MessagesShape` below, so useTranslations() stays callable
 * either way.
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentionally empty; augmented per-app above.
export interface FrontendShellMessages {}

type MessagesShape = Record<string, Record<string, string>>;

type AppMessages = keyof FrontendShellMessages extends never
  ? MessagesShape
  : FrontendShellMessages;

export function useTranslations<K extends keyof AppMessages & string>(
  namespace: K,
): (key: keyof AppMessages[K] & string) => string {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslations must be used within an I18nProvider');
  }

  const nsMessages = context.messages[namespace] || {};

  return React.useCallback(
    (key: string): string => {
      return nsMessages[key] ?? key;
    },
    [nsMessages],
  ) as (key: keyof AppMessages[K] & string) => string;
}
