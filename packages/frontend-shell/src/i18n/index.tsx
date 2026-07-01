'use client';

import * as React from 'react';

export const locales = ['zh-TW', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh-TW';

export function buildAllMessages<T extends Record<string, Record<string, string>>>(
  en: T,
  zhTW: T,
): Record<Locale, T> {
  return {
    en,
    'zh-TW': zhTW,
  };
}

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

export function useTranslations(namespace: string) {
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
  );
}
