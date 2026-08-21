import { METADATA_SCHEMA } from '@appspine/plugin-api';
import {
  AppspineAuthGuard,
  AuthenticationStrategyRegistry,
  PrincipalContextService,
} from '@appspine/plugin-host-nest';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  Prisma: {
    dmmf: {
      datamodel: {
        models: [
          {
            name: 'Page',
            dbName: 'wiki_pages',
            fields: [
              {
                name: 'id',
                type: 'String',
                kind: 'scalar',
                isRequired: true,
                isId: true,
                isList: false,
              },
            ],
          },
        ],
        enums: [],
      },
    },
  },
}));

import { MetaController } from './meta.controller';
import { MetaModule } from './meta.module';
import { MetaService } from './meta.service';
import { MetadataScopeGuard } from './meta-scope.guard';

describe('MetaModule Nest Application Bootstrap (Real DI Resolution)', () => {
  it('boots a full NestJS application with app.init() without dependency resolution errors', async () => {
    // Compile testing module
    const moduleRef = await Test.createTestingModule({
      imports: [MetaModule],
    }).compile();

    // Create real Nest application and trigger route binding & guard instantiation via app.init()
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      // 1. Verify MetaController is registered and accessible
      const controller = app.get(MetaController);
      expect(controller).toBeInstanceOf(MetaController);
      expect(controller.schema().availableScopes).toEqual([
        'wiki_pages:read',
        'wiki_pages:write',
        'wiki_pages:*',
      ]);

      // 2. Verify MetaService and METADATA_SCHEMA token resolve to the same instance
      const metaService = app.get(MetaService);
      const tokenService = app.get(METADATA_SCHEMA);
      expect(metaService).toBeInstanceOf(MetaService);
      expect(tokenService).toBe(metaService);

      // 3. Verify AppspineAuthInfrastructureModule provided dependencies are resolved in MetaModule
      const authRegistry = app.get(AuthenticationStrategyRegistry);
      const principalContext = app.get(PrincipalContextService);
      const authGuard = app.get(AppspineAuthGuard);
      const scopeGuard = app.get(MetadataScopeGuard);

      expect(authRegistry).toBeInstanceOf(AuthenticationStrategyRegistry);
      expect(principalContext).toBeInstanceOf(PrincipalContextService);
      expect(authGuard).toBeInstanceOf(AppspineAuthGuard);
      expect(scopeGuard).toBeInstanceOf(MetadataScopeGuard);
    } finally {
      await app.close();
    }
  });

  it('boots cleanly when imported into a consumer application module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetaModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const schema = app.get(MetaService).buildMeta();
    expect(schema.models).toHaveLength(1);
    expect(schema.models[0].name).toBe('Page');

    await app.close();
  });
});
