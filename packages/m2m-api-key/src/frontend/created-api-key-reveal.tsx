'use client';

import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useTranslations,
} from '@appspine/frontend-shell';
import { useState } from 'react';
import type { CreatedApiKeyRevealProps } from './types.js';

export function CreatedApiKeyReveal({ created, onDone }: CreatedApiKeyRevealProps) {
  const t = useTranslations('apiKeys');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(created.key);
    setCopied(true);
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>{t('createdTitle')}</DialogTitle>
        <DialogDescription>{t('createdDescription')}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2 py-4">
        <div className="break-all rounded-md border bg-muted p-3 font-mono text-sm">
          {created.key}
        </div>
        <Button type="button" variant="outline" onClick={handleCopy}>
          {copied ? t('copied') : t('copyToClipboard')}
        </Button>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onDone} disabled={!copied}>
          {t('doneAfterCopy')}
        </Button>
      </DialogFooter>
    </div>
  );
}
