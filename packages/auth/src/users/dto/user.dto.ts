import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  roleIds: z.array(z.string()).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateRolesSchema = z.object({
  roleIds: z.array(z.string()),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type UpdateRolesDto = z.infer<typeof updateRolesSchema>;
