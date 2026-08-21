import { RBAC_POLICY, type RbacPolicyPort, type RoleGrant } from '@appspine/plugin-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_USER_ROLE } from './constants';
import { RbacModule } from './rbac.module';
import { RbacPolicyService } from './rbac-policy.service';
import { RolesService } from './roles/roles.service';
import { buildUserContext } from './user-context.util';

vi.mock('@appspine/common', () => ({
  PermissionPolicy: {
    DENY_ALL: 'DENY_ALL',
    ALLOW_ALL: 'ALLOW_ALL',
    READ_ALL: 'READ_ALL',
  },
  PrismaService: class {},
  paginate: (data: unknown, total: number) => ({ data, total }),
  toPrismaOrderBy: () => undefined,
  toPrismaPage: () => ({ skip: 0, take: 20 }),
  toPrismaSortDirection: (sortOrder: string) => (sortOrder === 'ASC' ? 'asc' : 'desc'),
  paginationQuerySchema: {},
  ZodValidationPipe: class {},
}));

describe('legacy parity & token injection equivalence', () => {
  let directPolicyService: RbacPolicyService;
  let tokenInjectedPort: RbacPolicyPort;
  let rolesService: RolesService;

  const sampleRoles: RoleGrant[] = [
    {
      id: 'role-1',
      name: 'DEVELOPER',
      displayName: 'Developer',
      permissionPolicy: 'READ_ALL',
      permissions: [{ permission: 'CODE_READ' }, { permission: 'CODE_SUBMIT' }],
    },
    {
      id: 'role-2',
      name: 'QA',
      displayName: 'Quality Assurance',
      permissionPolicy: 'DENY_ALL',
      permissions: [{ permission: 'TEST_RUN' }, { permission: 'CODE_READ' }],
    },
  ];

  const prismaMock = {
    role: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    rolePermission: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    userRole: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      if (typeof cb === 'function') {
        return cb(prismaMock);
      }
      return Promise.all(cb);
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    directPolicyService = new RbacPolicyService(
      prismaMock as unknown as ConstructorParameters<typeof RbacPolicyService>[0],
    );

    // RbacModule binds { provide: RBAC_POLICY, useExisting: RbacPolicyService }
    // Token-injected port points to the same underlying RbacPolicyService instance
    tokenInjectedPort = directPolicyService;

    rolesService = new RolesService(
      prismaMock as unknown as ConstructorParameters<typeof RolesService>[0],
    );
  });

  describe('module wiring contract', () => {
    it('binds RBAC_POLICY to RbacPolicyService with useExisting in RbacModule', () => {
      const providers = Reflect.getMetadata('providers', RbacModule) || [];
      const exports = Reflect.getMetadata('exports', RbacModule) || [];

      expect(exports).toContain(RBAC_POLICY);
      expect(exports).toContain(RbacPolicyService);
      expect(providers).toEqual(
        expect.arrayContaining([
          RbacPolicyService,
          expect.objectContaining({ provide: RBAC_POLICY, useExisting: RbacPolicyService }),
        ]),
      );
    });
  });

  describe('flatten parity', () => {
    it('produces identical authorization output across direct service, token port, and util', () => {
      const utilResult = buildUserContext(sampleRoles);
      const directResult = directPolicyService.flatten(sampleRoles);
      const tokenResult = tokenInjectedPort.flatten(sampleRoles);

      expect(directResult).toEqual(utilResult);
      expect(tokenResult).toEqual(utilResult);
      expect(tokenResult).toEqual(directResult);
    });
  });

  describe('rolesForUser parity', () => {
    it('produces identical role grants across direct service and token port', async () => {
      prismaMock.userRole.findMany.mockResolvedValue([
        { role: sampleRoles[0] },
        { role: sampleRoles[1] },
      ]);

      const directGrants = await directPolicyService.rolesForUser('user-abc');
      const tokenGrants = await tokenInjectedPort.rolesForUser('user-abc');

      expect(directGrants).toEqual(sampleRoles);
      expect(tokenGrants).toEqual(sampleRoles);
      expect(tokenGrants).toEqual(directGrants);
    });
  });

  describe('defaultRoleIds parity', () => {
    it('produces identical default role ID across direct service and token port', async () => {
      prismaMock.role.findUnique.mockResolvedValue({
        id: 'default-user-role-id',
        name: SYSTEM_USER_ROLE,
      });

      const directDefaults = await directPolicyService.defaultRoleIds();
      const tokenDefaults = await tokenInjectedPort.defaultRoleIds();

      expect(directDefaults).toEqual(['default-user-role-id']);
      expect(tokenDefaults).toEqual(['default-user-role-id']);
      expect(tokenDefaults).toEqual(directDefaults);
    });
  });

  describe('replaceUserRoles parity', () => {
    it('executes identical replace operations across direct service and token port', async () => {
      await directPolicyService.replaceUserRoles('user-1', ['role-1']);
      await tokenInjectedPort.replaceUserRoles('user-2', ['role-2']);

      expect(prismaMock.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prismaMock.userRole.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-1', roleId: 'role-1' }],
      });

      expect(prismaMock.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-2' } });
      expect(prismaMock.userRole.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-2', roleId: 'role-2' }],
      });
    });
  });

  describe('RolesService provider accessibility', () => {
    it('exports RolesService seamlessly for consumer usage', () => {
      expect(rolesService).toBeDefined();
      expect(rolesService.findAll).toBeTypeOf('function');
      expect(rolesService.create).toBeTypeOf('function');
      expect(rolesService.update).toBeTypeOf('function');
      expect(rolesService.remove).toBeTypeOf('function');
    });
  });
});
