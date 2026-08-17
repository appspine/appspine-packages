import { redirect } from 'next/navigation';
import type { CurrentUser } from './current-user.js';

/**
 * Creates a server-side route/page guard that redirects unauthenticated users or users
 * lacking the ADMIN role to the specified unauthorized path (default: "/unauthorized").
 */
export function createRequireAdminPage(
  getCurrentUser: () => Promise<CurrentUser | null | undefined>,
  unauthorizedPath = '/unauthorized',
): () => Promise<CurrentUser> {
  return async function requireAdminPage(): Promise<CurrentUser> {
    const user = await getCurrentUser();
    if (!user?.roleNames.includes('ADMIN')) {
      redirect(unauthorizedPath);
    }
    return user as CurrentUser;
  };
}
