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
  Checkbox,
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
  Label,
  useTranslations,
} from '@appspine/frontend-shell';
import { MoreHorizontal } from 'lucide-react';
import { useState, useTransition } from 'react';
import type { UserRowActionsProps } from './types.js';

export function UserRowActions({
  user,
  roles,
  isSelf,
  setUserActiveAction,
  setUserServiceAccountAction,
  updateUserRolesAction,
  deleteUserAction,
}: UserRowActionsProps) {
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
        setRolesOpen(false);
      }
    });
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

  const userRoleIds = new Set(user.roles.map((r) => r.id));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">{tCommon('actions')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRolesOpen(true)}>{t('editRoles')}</DropdownMenuItem>
          <DropdownMenuItem onClick={toggleActive} disabled={isPending}>
            {user.isActive ? t('deactivate') : t('activate')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleServiceAccount} disabled={isPending}>
            {user.isServiceAccount ? t('unsetServiceAccount') : t('setServiceAccount')}
          </DropdownMenuItem>
          {!isSelf && (
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              {tCommon('delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent>
          <form action={handleRolesSubmit}>
            <DialogHeader>
              <DialogTitle>{t('editRoles')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 py-4">
              {roles.map((role) => (
                <Label key={role.id} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    name="roleIds"
                    value={role.id}
                    defaultChecked={userRoleIds.has(role.id)}
                  />
                  {role.displayName}
                </Label>
              ))}
              {error && <FieldError>{error}</FieldError>}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRolesOpen(false)}
                disabled={isPending}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteUser')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDesc')}</AlertDialogDescription>
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
