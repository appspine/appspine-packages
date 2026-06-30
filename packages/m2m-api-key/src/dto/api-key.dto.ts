import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  roleId: z.string().min(1),
  scopes: z.array(z.string().min(1)),
  rateLimit: z.number().int().min(1).max(600).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  roleId: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).optional(),
  rateLimit: z.number().int().min(1).max(600).nullable().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyDto = z.infer<typeof updateApiKeySchema>;

export interface RoleRef {
  id: string;
  name: string;
  displayName: string;
}

export interface CreateApiKeyResponse {
  id: string;
  key: string;
  prefix: string;
  name: string;
  roleId: string;
  role: RoleRef;
  scopes: string[];
  createdAt: Date;
}
