'use client';

import {
  Button,
  Checkbox,
  DateTimePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useTranslations,
} from '@appspine/frontend-shell';
import { useState, useTransition } from 'react';
import { CreatedApiKeyReveal } from './created-api-key-reveal.js';
import type { CreateApiKeyDialogProps, CreateApiKeyResponse } from './types.js';
import { SCOPE_ACTIONS, SCOPE_RESOURCES } from './types.js';

export function CreateApiKeyDialog({
  roles,
  serviceAccounts,
  scopeOptions,
  createApiKeyAction,
}: CreateApiKeyDialogProps) {
  const t = useTranslations('apiKeys');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createApiKeyAction(formData);
      if (result.error || !result.created) {
        setError(result.error ?? 'Failed to create API key');
      } else {
        setCreated(result.created);
      }
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setCreated(null);
    }
  }

  const resolvedScopeOptions =
    scopeOptions && scopeOptions.length > 0
      ? scopeOptions
      : SCOPE_RESOURCES.flatMap((resource) =>
          SCOPE_ACTIONS.map((action) => ({
            value: `${resource}:${action}`,
            label: `${resource}:${action}`,
          })),
        );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>{t('newApiKey')}</Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <CreatedApiKeyReveal created={created} onDone={() => setOpen(false)} />
        ) : (
          <form action={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{t('createApiKey')}</DialogTitle>
              <DialogDescription>{t('createDesc')}</DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="new-key-name">{t('name')}</FieldLabel>
                <Input id="new-key-name" name="name" type="text" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-key-role">{t('role')}</FieldLabel>
                <Select name="roleId" required>
                  <SelectTrigger id="new-key-role">
                    <SelectValue placeholder={t('selectRole')} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="new-key-acting-user">{t('actingUser')}</FieldLabel>
                <Select name="actingUserId" defaultValue="__none">
                  <SelectTrigger id="new-key-acting-user">
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
              </Field>
              <Field>
                <FieldLabel>{t('scopes')}</FieldLabel>
                <div className="max-h-40 overflow-y-auto rounded-md border p-3">
                  <div className="flex flex-col gap-2">
                    {resolvedScopeOptions.map((scope) => (
                      <Label key={scope.value} className="flex items-center gap-2 font-normal">
                        <Checkbox name="scopes" value={scope.value} />
                        <span className="font-mono text-xs">{scope.label}</span>
                      </Label>
                    ))}
                  </div>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="new-key-rate-limit">{t('rateLimit')}</FieldLabel>
                <Input
                  id="new-key-rate-limit"
                  name="rateLimit"
                  type="number"
                  min={1}
                  placeholder={t('rateLimitPlaceholder')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-key-expires">{t('expiresAt')}</FieldLabel>
                <DateTimePicker name="expiresAt" />
              </Field>
              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t('creating') : t('create')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
