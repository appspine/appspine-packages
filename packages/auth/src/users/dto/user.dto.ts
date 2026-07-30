import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  // Optional under OIDC-only auth (dev_docs/framework/035) — this endpoint no longer
  // requires a password. Kept in the schema for callers that still pass one (e.g. a
  // deliberately password-protected break-glass account); the value is hashed if present.
  password: z.string().min(8).optional(),
  name: z.string().optional(),
  isServiceAccount: z.boolean().optional(),
  roleIds: z.array(z.string()).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().optional(),
  isActive: z.boolean().optional(),
  isServiceAccount: z.boolean().optional(),
});

export const updateRolesSchema = z.object({
  roleIds: z.array(z.string()),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type UpdateRolesDto = z.infer<typeof updateRolesSchema>;
