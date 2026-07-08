'use client';

import { MoreHorizontal } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useTranslations } from '../../i18n/index.js';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js';
import { FieldError } from '../ui/field.js';
import { Label } from '../ui/label.js';

import type { UserRoleOption, UserRow } from './types.js';

export function UserRowActions({
  user,
  roles,
  isSelf,
  setUserActiveAction,
  setUserServiceAccountAction,
  updateUserRolesAction,
  deleteUserAction,
}: {
  user: UserRow;
  roles: UserRoleOption[];
  isSelf: boolean;
  setUserActiveAction: (id: string, isActive: boolean) => Promise<{ error?: string }>;
  setUserServiceAccountAction: (
    id: string,
    isServiceAccount: boolean,
  ) => Promise<{ error?: string }>;
  updateUserRolesAction: (id: string, formData: FormData) => Promise<{ error?: string }>;
  deleteUserAction: (id: string) => Promise<{ error?: string }>;
}) {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const [rolesOpen, setRolesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await setUserActiveAction(user.id, !user.isActive);
      if (result.error) setError(result.error);
    });
  }

  function toggleServiceAccount() {
    setError(null);
    startTransition(async () => {
      const result = await setUserServiceAccountAction(user.id, !user.isServiceAccount);
      if (result.error) setError(result.error);
    });
  }

  function handleRolesSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateUserRolesAction(user.id, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  function setOpen(val: boolean) {
    setRolesOpen(val);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteUserAction(user.id);
      if (result.error) {
        setError(result.error);
      } else {
        setDeleteOpen(false);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${user.email}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRolesOpen(true)}>
            {t('manageRoles')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleActive} disabled={isPending}>
            {user.isActive ? t('deactivate') : t('activate')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleServiceAccount} disabled={isPending}>
            {user.isServiceAccount ? t('unmarkServiceAccount') : t('markServiceAccount')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={isSelf}
            onSelect={() => setDeleteOpen(true)}
          >
            {t('delete')}
            {isSelf ? t('cantDeleteSelf') : ''}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent>
          <form action={handleRolesSubmit}>
            <DialogHeader>
              <DialogTitle>{t('rolesForUser').replace('{email}', user.email)}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-4">
              {roles.map((role) => (
                <Label key={role.id} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    name="roleIds"
                    value={role.id}
                    defaultChecked={user.roles.some((r) => r.id === role.id)}
                  />
                  {role.displayName}
                </Label>
              ))}
              {error && <FieldError>{error}</FieldError>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? t('saving') : tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deleteUserTitle').replace('{email}', user.email)}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              {isPending ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
