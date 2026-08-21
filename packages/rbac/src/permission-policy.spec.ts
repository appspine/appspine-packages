import type { RoleGrant } from '@appspine/plugin-api';
import { describe, expect, it } from 'vitest';
import { RbacPolicyService } from './rbac-policy.service';
import { buildUserContext } from './user-context.util';

describe('permission policy', () => {
  const service = new RbacPolicyService(
    null as unknown as import('@appspine/common').PrismaService,
  );

  const testRoles: Record<string, RoleGrant> = {
    denyRole: {
      id: 'role-1',
      name: 'OPERATOR',
      displayName: 'Operator',
      permissionPolicy: 'DENY_ALL',
      permissions: [{ permission: 'POST_READ' }, { permission: 'POST_CREATE' }],
    },
    readAllRole: {
      id: 'role-2',
      name: 'AUDITOR',
      displayName: 'Auditor',
      permissionPolicy: 'READ_ALL',
      permissions: [{ permission: 'AUDIT_EXPORT' }],
    },
    allowAllRole: {
      id: 'role-3',
      name: 'SUPER_OPERATOR',
      displayName: 'Super Operator',
      permissionPolicy: 'ALLOW_ALL',
      permissions: [],
    },
    guestRole: {
      id: 'role-4',
      name: 'GUEST',
      displayName: 'Guest',
      permissionPolicy: 'DENY_ALL',
      permissions: [{ permission: 'POST_READ' }], // duplicate of operator
    },
  };

  describe('buildUserContext and flatten consistency', () => {
    it('returns identical result between buildUserContext() and RbacPolicyService.flatten()', () => {
      const roles = [testRoles.denyRole, testRoles.readAllRole];
      const context = buildUserContext(roles);
      const flattened = service.flatten(roles);

      expect(context).toEqual(flattened);
    });
  });

  describe('policy hierarchy and precedence', () => {
    it('defaults to DENY_ALL and empty arrays when no roles are assigned', () => {
      const result = service.flatten([]);

      expect(result).toEqual({
        roleNames: [],
        permissionPolicy: 'DENY_ALL',
        permissions: [],
      });
    });

    it('retains single DENY_ALL policy correctly', () => {
      const result = service.flatten([testRoles.denyRole]);

      expect(result.roleNames).toEqual(['OPERATOR']);
      expect(result.permissionPolicy).toBe('DENY_ALL');
      expect(result.permissions).toEqual(['POST_READ', 'POST_CREATE']);
    });

    it('promotes DENY_ALL + READ_ALL to READ_ALL', () => {
      const result = service.flatten([testRoles.denyRole, testRoles.readAllRole]);

      expect(result.roleNames).toEqual(['OPERATOR', 'AUDITOR']);
      expect(result.permissionPolicy).toBe('READ_ALL');
      expect(result.permissions).toEqual(['POST_READ', 'POST_CREATE', 'AUDIT_EXPORT']);
    });

    it('promotes READ_ALL + ALLOW_ALL to ALLOW_ALL', () => {
      const result = service.flatten([testRoles.readAllRole, testRoles.allowAllRole]);

      expect(result.roleNames).toEqual(['AUDITOR', 'SUPER_OPERATOR']);
      expect(result.permissionPolicy).toBe('ALLOW_ALL');
      expect(result.permissions).toEqual(['AUDIT_EXPORT']);
    });

    it('promotes DENY_ALL + ALLOW_ALL directly to ALLOW_ALL', () => {
      const result = service.flatten([testRoles.denyRole, testRoles.allowAllRole]);

      expect(result.roleNames).toEqual(['OPERATOR', 'SUPER_OPERATOR']);
      expect(result.permissionPolicy).toBe('ALLOW_ALL');
      expect(result.permissions).toEqual(['POST_READ', 'POST_CREATE']);
    });
  });

  describe('permission deduplication', () => {
    it('deduplicates explicit permissions across multiple roles', () => {
      const result = service.flatten([testRoles.denyRole, testRoles.guestRole]);

      expect(result.roleNames).toEqual(['OPERATOR', 'GUEST']);
      expect(result.permissions).toEqual(['POST_READ', 'POST_CREATE']);
      expect(result.permissions.filter((p) => p === 'POST_READ').length).toBe(1);
    });
  });
});
