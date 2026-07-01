'use client';

import { useTransition } from 'react';

import { Languages } from 'lucide-react';

import { locales, type Locale, useTranslations } from '../../i18n/index.js';
import { Button } from '../ui/button.js';
import {
  DropdownMenuCheckboxItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js';

interface LocaleSwitcherProps {
  readonly currentLocale: Locale;
  readonly onLocaleChange: (nextLocale: Locale) => void;
}

const LOCALE_LABELS: Record<Locale, string> = {
  'zh-TW': '繁體中文',
  en: 'English',
};

export function LocaleSwitcher({ currentLocale, onLocaleChange }: LocaleSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('common');

  const onSelect = (nextLocale: Locale) => {
    if (nextLocale === currentLocale) return;
    startTransition(() => {
      onLocaleChange(nextLocale);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" disabled={isPending} aria-label={t('localeSwitcher')}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuCheckboxItem
            key={locale}
            checked={locale === currentLocale}
            onClick={() => onSelect(locale)}
            className={locale === currentLocale ? 'font-medium' : ''}
          >
            {LOCALE_LABELS[locale]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
