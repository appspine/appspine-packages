'use client';

import { useState, useTransition } from 'react';

import { useTranslations } from '../../i18n/index.js';
import { DateTimePicker } from '../date-time-picker.js';

import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.js';
import type { CreateApiKeyResult } from './actions-core.js';
import { CreatedApiKeyReveal } from './created-api-key-reveal.js';
import type {
  ApiKeyRoleOption,
  ApiKeyScopeOption,
  CreateApiKeyResponse,
  ServiceAccountOption,
} from './types.js';
import { SCOPE_ACTIONS, SCOPE_RESOURCES } from './types.js';

export function CreateApiKeyDialog({
  roles,
  serviceAccounts,
  scopeOptions,
  createApiKeyAction,
}: {
  roles: ApiKeyRoleOption[];
  serviceAccounts: ServiceAccountOption[];
  scopeOptions?: ApiKeyScopeOption[];
  createApiKeyAction: (formData: FormData) => Promise<CreateApiKeyResult>;
}) {
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
                <FieldLabel>{t('scopes')}</FieldLabel>
                <div className="flex flex-col gap-2">
                  <Label className="flex items-center gap-2 font-normal">
                    <Checkbox name="scopes" value="*" />
                    {t('fullAccess')}
                  </Label>
                  {resolvedScopeOptions.map((scope) => (
                    <Label key={scope.value} className="flex items-center gap-2 font-normal">
                      <Checkbox name="scopes" value={scope.value} />
                      {scope.label}
                    </Label>
                  ))}
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="new-key-rate-limit">{t('rateLimit')}</FieldLabel>
                <Input id="new-key-rate-limit" name="rateLimit" type="number" min={1} max={600} />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-key-acting-user">{t('actingUserOptional')}</FieldLabel>
                <Select name="actingUserId" defaultValue="__none">
                  <SelectTrigger id="new-key-acting-user">
                    <SelectValue placeholder={t('actingUserNone')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t('actingUserNone')}</SelectItem>
                    {serviceAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="new-key-expires-at">{t('expiresAt')}</FieldLabel>
                <DateTimePicker name="expiresAt" placeholder={t('expiresAt')} />
              </Field>
              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? t('creating') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
