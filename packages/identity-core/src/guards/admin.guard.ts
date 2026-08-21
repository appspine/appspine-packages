import { SystemAdminGuard } from '@appspine/plugin-host-nest';

/**
 * Legacy name for the host's `SystemAdminGuard`, kept so `@UseGuards(AdminGuard)` in an existing
 * consumer (and the `@appspine/auth` facade's re-export) keeps working unchanged. One
 * implementation, three names — see the host guard for why (Gate G1 review S9).
 */
export { SystemAdminGuard as AdminGuard };
