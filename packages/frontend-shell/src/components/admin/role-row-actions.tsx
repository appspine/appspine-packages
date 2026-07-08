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
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field.js';
import { Input } from '../ui/input.js';
import { Label } from '../ui/label.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.js';

import type { RoleRow } from './types.js';

export function RoleRowActions({
  role,
  policyOptions,
  permissionOptions,
  updateRoleAction,
  deleteRoleAction,
  renderEnumLabel,
}: {
  role: RoleRow;
  policyOptions: readonly string[];
  permissionOptions: readonly string[];
  updateRoleAction: (id: string, formData: FormData) => Promise<{ error?: string }>;
  deleteRoleAction: (id: string) => Promise<{ error?: string }>;
  renderEnumLabel: (kind: 'PermissionPolicy' | 'Permission', value: string) => string;
}) {
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

      <Dialog
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next);
          if (next) setError(null);
        }}
      >
        <DialogContent>
          <form action={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>{t('editRoleTitle').replace('{name}', role.name)}</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor={`edit-role-display-name-${role.id}`}>
                  {t('displayName')}
                </FieldLabel>
                <Input
                  id={`edit-role-display-name-${role.id}`}
                  name="displayName"
                  type="text"
                  defaultValue={role.displayName}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`edit-role-policy-${role.id}`}>
                  {t('permissionPolicy')}
                </FieldLabel>
                <Select
                  name="permissionPolicy"
                  defaultValue={role.permissionPolicy}
                  disabled={isAdmin}
                >
                  <SelectTrigger id={`edit-role-policy-${role.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {policyOptions.map((policy) => (
                      <SelectItem key={policy} value={policy}>
                        {renderEnumLabel('PermissionPolicy', policy)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>
                  {t('permissions')}
                  {isAdmin && (
                    <span className="font-normal text-muted-foreground">
                      {t('permissionsManagedForAdmin')}
                    </span>
                  )}
                </FieldLabel>
                <div className="flex flex-col gap-2">
                  {permissionOptions.map((permission) => (
                    <Label key={permission} className="flex items-center gap-2 font-normal">
                      <Checkbox
                        name="permissions"
                        value={permission}
                        disabled={isAdmin}
                        defaultChecked={role.permissions.includes(permission)}
                      />
                      {renderEnumLabel('Permission', permission)}
                    </Label>
                  ))}
                </div>
              </Field>
              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
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
              {t('deleteRoleTitle').replace('{name}', role.displayName)}
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
