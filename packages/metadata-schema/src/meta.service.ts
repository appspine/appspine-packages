import type { PrismaDmmfDatamodel } from '@appspine/common';
import { Prisma } from '@appspine/common';
import { Injectable } from '@nestjs/common';

export interface FieldMeta {
  name: string;
  type: string;
  kind: string;
  isRequired: boolean;
  isUnique: boolean;
  isId: boolean;
  isList: boolean;
  hasDefault: boolean;
  default?: unknown;
  documentation?: string;
  relationName?: string;
}

export interface ModelMeta {
  name: string;
  dbTable: string;
  documentation?: string;
  fields: FieldMeta[];
}

export interface EnumValueMeta {
  name: string;
  documentation?: string;
}

export interface EnumMeta {
  name: string;
  documentation?: string;
  values: EnumValueMeta[];
}

export interface SchemaMeta {
  generatedAt: string;
  models: ModelMeta[];
  enums: EnumMeta[];
  availableScopes: string[];
}

@Injectable()
export class MetaService {
  buildMeta(): SchemaMeta {
    // Prisma.dmmf's shape isn't exposed in @prisma/client's public types, so this cast is the
    // one place that bridges to it; everything downstream is properly typed.
    const { models, enums } = Prisma.dmmf.datamodel as unknown as PrismaDmmfDatamodel;

    const modelsMeta: ModelMeta[] = models.map((m) => ({
      name: m.name,
      dbTable: m.dbName ?? m.name.toLowerCase(),
      documentation: m.documentation,
      fields: m.fields
        .filter((f) => f.kind !== 'object')
        .map((f) => ({
          name: f.name,
          type: f.type,
          kind: f.kind,
          isRequired: f.isRequired,
          isUnique: f.isUnique ?? false,
          isId: f.isId ?? false,
          isList: f.isList,
          hasDefault: f.hasDefaultValue ?? false,
          default: f.default,
          documentation: f.documentation,
        })),
    }));

    return {
      generatedAt: new Date().toISOString(),
      models: modelsMeta,
      enums: enums.map((e) => ({
        name: e.name,
        documentation: e.documentation,
        values: e.values.map((v) => ({
          name: v.name,
          documentation: v.documentation,
        })),
      })),
      availableScopes: this.deriveScopes(modelsMeta),
    };
  }

  private deriveScopes(models: Pick<ModelMeta, 'dbTable' | 'documentation'>[]): string[] {
    return models
      .filter((m) => !m.documentation?.includes('@internal'))
      .flatMap((m) => [`${m.dbTable}:read`, `${m.dbTable}:write`, `${m.dbTable}:*`]);
  }
}
