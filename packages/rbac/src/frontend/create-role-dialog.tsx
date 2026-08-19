'use client';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import type { CreateRoleDialogProps } from './types.js';

export function CreateRoleDialog({
  policyOptions,
  permissionOptions,
  createRoleAction,
}: CreateRoleDialogProps) {
  const t = useTranslations('roles');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createRoleAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>{t('newRole')}</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('createRole')}</DialogTitle>
            <DialogDescription>{t('createDesc')}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="new-role-name">{t('name')}</FieldLabel>
              <Input
                id="new-role-name"
                name="name"
                type="text"
                placeholder="EDITOR"
                pattern="[A-Z][A-Z0-9_]*"
                title="Uppercase letters, numbers and underscores, starting with a letter"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-role-display-name">{t('displayName')}</FieldLabel>
              <Input id="new-role-display-name" name="displayName" type="text" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-role-policy">{t('permissionPolicy')}</FieldLabel>
              <Select name="permissionPolicy" defaultValue="DENY_ALL">
                <SelectTrigger id="new-role-policy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {policyOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t('permissions')}</FieldLabel>
              <div className="max-h-48 overflow-y-auto rounded-md border p-3">
                <div className="flex flex-col gap-2">
                  {permissionOptions.map(({ value, label }) => (
                    <Label key={value} className="flex items-center gap-2 font-normal">
                      <Checkbox name="permissions" value={value} />
                      <span className="font-mono text-xs">{label}</span>
                    </Label>
                  ))}
                </div>
              </div>
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
