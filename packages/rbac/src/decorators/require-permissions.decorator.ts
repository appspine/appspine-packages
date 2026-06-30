import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
// OR semantics: user must have at least ONE of the listed permissions. ADMIN always bypasses.
// Accepts string so apps can pass their own app-specific Permission enum values.
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
