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
import { MoreHorizontal } from 'lucide-react';
import { useState, useTransition } from 'react';
import type { RoleRowActionsProps } from './types.js';

export function RoleRowActions({
  role,
  policyOptions,
  permissionOptions,
  updateRoleAction,
  deleteRoleAction,
}: RoleRowActionsProps) {
  const t = useTranslations('roles');
  const tCommon = useTranslations('common');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role.name === 'ADMIN';
  const canDelete = !role.isSystem && role.userCount === 0 && role.apiKeyCount === 0;

  function handleEditSubmit(formData: FormData) {
    setError(null);
    formData.set('editablePermissions', String(!isAdmin));
    startTransition(async () => {
      const result = await updateRoleAction(role.id, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setEditOpen(false);
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRoleAction(role.id);
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
          <Button variant="ghost" size="icon" aria-label={`Actions for ${role.displayName}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>{t('edit')}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDelete}
            onSelect={() => setDeleteOpen(true)}
          >
            {t('delete')}
            {canDelete ? '' : t('cantDeleteInUse')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form action={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>{t('editRole')}</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel>{t('name')}</FieldLabel>
                <Input value={role.name} disabled readOnly className="bg-muted" />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-role-display-name">{t('displayName')}</FieldLabel>
                <Input
                  id="edit-role-display-name"
                  name="displayName"
                  defaultValue={role.displayName}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-role-policy">{t('permissionPolicy')}</FieldLabel>
                <Select
                  name="permissionPolicy"
                  defaultValue={role.permissionPolicy}
                  disabled={isAdmin}
                >
                  <SelectTrigger id="edit-role-policy">
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
                {isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    {t('adminPolicyFixed')}
                  </p>
                )}
              </Field>
              <Field>
                <FieldLabel>{t('permissions')}</FieldLabel>
                {isAdmin ? (
                  <p className="text-xs text-muted-foreground">
                    {t('adminPermissionsFixed')}
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-md border p-3">
                    <div className="flex flex-col gap-2">
                      {permissionOptions.map(({ value, label }) => {
                        const isAssigned = role.permissions.includes(value);
                        return (
                          <Label key={value} className="flex items-center gap-2 font-normal">
                            <Checkbox
                              name="permissions"
                              value={value}
                              defaultChecked={isAssigned}
                            />
                            <span className="font-mono text-xs">{label}</span>
                          </Label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Field>
              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
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
            <AlertDialogTitle>{t('deleteRole')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteRoleDesc')}</AlertDialogDescription>
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
