import { SystemAdminGuard } from '@appspine/plugin-host-nest';

/**
 * API keys' name for the host's `SystemAdminGuard`. This file used to carry its own copy with a
 * bare `'ADMIN'` literal — no shared constant, nothing to compare it against (Gate G1 review S9).
 */
export { SystemAdminGuard as ApiKeyAdminGuard };
