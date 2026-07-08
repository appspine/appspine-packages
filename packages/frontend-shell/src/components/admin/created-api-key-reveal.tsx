'use client';

import { useState } from 'react';

import { useTranslations } from '../../i18n/index.js';

import { Button } from '../ui/button.js';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog.js';

import type { CreateApiKeyResponse } from './types.js';

export function CreatedApiKeyReveal({
  created,
  onDone,
}: {
  created: CreateApiKeyResponse;
  onDone: () => void;
}) {
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
