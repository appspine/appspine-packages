import { cache } from 'react';
import { ApiError } from '../lib/api-client.js';

export interface CurrentUser {
  sub: string;
  email: string;
  name: string | null;
  roleName: string;
  roleNames: string[];
  permissionPolicy: string;
  permissions: string[];
}

export type FetchCurrentUserFn = <T = CurrentUser>(url: string) => Promise<T>;

/**
 * Creates a cached `getCurrentUser()` function tied to the provided `apiFetch` instance.
 * Returns null when unauthenticated (401) or returns the CurrentUser payload.
 */
export function createGetCurrentUser(apiFetch: FetchCurrentUserFn) {
  return cache(async (): Promise<CurrentUser | null> => {
    try {
      return await apiFetch<CurrentUser>('/auth/me');
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) return null;
      throw err;
    }
  });
}
