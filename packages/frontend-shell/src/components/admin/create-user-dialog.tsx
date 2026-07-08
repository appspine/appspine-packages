'use client';

import { useState, useTransition } from 'react';

import { useTranslations } from '../../i18n/index.js';

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

import type { UserRoleOption } from './types.js';

export function CreateUserDialog({
  roles,
  createUserAction,
}: {
  roles: UserRoleOption[];
  createUserAction: (formData: FormData) => Promise<{ error?: string }>;
}) {
  const t = useTranslations('users');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createUserAction(formData);
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
        <Button>{t('newUser')}</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('createUser')}</DialogTitle>
            <DialogDescription>{t('createDesc')}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="new-user-email">{t('email')}</FieldLabel>
              <Input id="new-user-email" name="email" type="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-password">{t('password')}</FieldLabel>
              <Input
                id="new-user-password"
                name="password"
                type="password"
                minLength={8}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-name">{t('name')}</FieldLabel>
              <Input id="new-user-name" name="name" type="text" />
            </Field>
            <Field>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox name="isServiceAccount" />
                {t('isServiceAccount')}
              </Label>
            </Field>
            <Field>
              <FieldLabel>{t('roles')}</FieldLabel>
              <div className="flex flex-col gap-2">
                {roles.map((role) => (
                  <Label key={role.id} className="flex items-center gap-2 font-normal">
                    <Checkbox name="roleIds" value={role.id} />
                    {role.displayName}
                  </Label>
                ))}
              </div>
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? t('creating') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
