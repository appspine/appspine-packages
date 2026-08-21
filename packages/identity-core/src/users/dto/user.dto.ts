import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  /**
   * Accepted by the pre-split endpoint (it hashed the value with bcrypt for a break-glass
   * password account) and **rejected** here.
   *
   * 051 decision 7 makes identity provider-neutral and leaves credentials entirely to an
   * authentication plugin, so `identity-core` has no business hashing anything. Dropping the key
   * from the schema would have been quieter but worse: zod strips unknown keys, so a caller still
   * sending a password would have been told the account was created *with* one. Rejecting says
   * what actually happened.
   */
  password: z
    .never({
      message:
        'identity-core does not accept credentials (051 decision 7). Local password accounts were ' +
        'removed in the Phase 1 identity split; use an authentication plugin instead.',
    })
    .optional(),
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
