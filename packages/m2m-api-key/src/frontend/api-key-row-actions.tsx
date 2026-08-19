'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FieldError,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useTranslations,
} from '@appspine/frontend-shell';
import { MoreHorizontal } from 'lucide-react';
import { useState, useTransition } from 'react';
import type { ApiKeyRowActionsProps } from './types.js';

export function ApiKeyRowActions({
  apiKey,
  serviceAccounts,
  setApiKeyActiveAction,
  deleteApiKeyAction,
  updateApiKeyActingUserAction,
}: ApiKeyRowActionsProps) {
  const t = useTranslations('apiKeys');
  const tCommon = useTranslations('common');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actingUserOpen, setActingUserOpen] = useState(false);
  const [selectedActingUserId, setSelectedActingUserId] = useState(
    apiKey.actingUserId ?? '__none',
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await setApiKeyActiveAction(apiKey.id, !apiKey.isActive);
      if (result.error) setError(result.error);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteApiKeyAction(apiKey.id);
      if (result.error) {
        setError(result.error);
      } else {
        setDeleteOpen(false);
      }
    });
  }

  function handleActingUserSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await updateApiKeyActingUserAction(
        apiKey.id,
        selectedActingUserId === '__none' ? null : selectedActingUserId,
      );
      if (result.error) {
        setError(result.error);
      } else {
        setActingUserOpen(false);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${apiKey.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={toggleActive} disabled={isPending}>
            {apiKey.isActive ? t('deactivate') : t('activate')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setActingUserOpen(true)}>
            {t('setActingUser')}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            {tCommon('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={actingUserOpen} onOpenChange={setActingUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('setActingUser')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={selectedActingUserId}
              onValueChange={setSelectedActingUserId}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('actingUserNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t('actingUserNone')}</SelectItem>
                {serviceAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.email} {account.name ? `(${account.name})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <FieldError className="mt-2">{error}</FieldError>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setActingUserOpen(false)}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleActingUserSubmit} disabled={isPending}>
              {isPending ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteApiKey')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteApiKeyDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? t('deleting') : tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
