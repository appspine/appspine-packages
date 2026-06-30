import { PermissionPolicy } from '@appspine/common';
import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_]+$/, 'Name must be uppercase letters, digits and underscores only'),
  displayName: z.string().min(1).max(100),
  permissionPolicy: z.nativeEnum(PermissionPolicy).default('DENY_ALL'),
  permissions: z.array(z.string()).default([]),
});

// permissions included here so PATCH /roles/:id can atomically update metadata + permissions
export const updateRoleSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  permissionPolicy: z.nativeEnum(PermissionPolicy).optional(),
  permissions: z.array(z.string()).optional(),
});

export const replacePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
export type ReplacePermissionsDto = z.infer<typeof replacePermissionsSchema>;
