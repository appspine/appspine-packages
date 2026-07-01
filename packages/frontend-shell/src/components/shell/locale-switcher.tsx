'use client';

import { Languages } from 'lucide-react';

import { type Locale, useTranslations } from '../../i18n/index.js';
import { Button } from '../ui/button.js';

interface LocaleSwitcherProps {
  readonly currentLocale: Locale;
  readonly onLocaleChange: (nextLocale: Locale) => void;
}

export function LocaleSwitcher({ currentLocale, onLocaleChange }: LocaleSwitcherProps) {
  const t = useTranslations('common');

  const toggleLocale = () => {
    const nextLocale = currentLocale === 'zh-TW' ? 'en' : 'zh-TW';
    onLocaleChange(nextLocale);
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={toggleLocale}
      aria-label={t('localeSwitcher')}
      className="gap-1 px-2 h-8"
    >
      <Languages className="size-4 text-muted-foreground" />
      <span className="text-xs uppercase font-semibold text-muted-foreground">{currentLocale}</span>
    </Button>
  );
}
