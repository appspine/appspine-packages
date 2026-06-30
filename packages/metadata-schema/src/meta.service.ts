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

// biome-ignore lint/suspicious/noExplicitAny: Prisma.dmmf shape isn't exposed in @prisma/client's public types
type AnyDMMF = any;

@Injectable()
export class MetaService {
  buildMeta(): SchemaMeta {
    const { models, enums } = Prisma.dmmf.datamodel as AnyDMMF;

    const modelsMeta: ModelMeta[] = models.map((m: AnyDMMF) => ({
      name: m.name,
      dbTable: m.dbName ?? m.name.toLowerCase(),
      documentation: m.documentation,
      fields: m.fields
        .filter((f: AnyDMMF) => f.kind !== 'object')
        .map((f: AnyDMMF) => ({
          name: f.name,
          type: f.type,
          kind: f.kind,
          isRequired: f.isRequired,
          isUnique: f.isUnique,
          isId: f.isId,
          isList: f.isList,
          hasDefault: f.hasDefaultValue,
          default: f.default,
          documentation: f.documentation,
        })),
    }));

    return {
      generatedAt: new Date().toISOString(),
      models: modelsMeta,
      enums: enums.map((e: AnyDMMF) => ({
        name: e.name,
        documentation: e.documentation,
        values: e.values.map((v: AnyDMMF) => ({
          name: v.name,
          documentation: v.documentation,
        })),
      })),
      availableScopes: this.deriveScopes(modelsMeta),
    };
  }

  getAvailableScopes(): string[] {
    return this.deriveScopes(
      (Prisma.dmmf.datamodel as AnyDMMF).models.map((m: AnyDMMF) => ({
        dbTable: m.dbName ?? m.name.toLowerCase(),
        documentation: m.documentation,
      })),
    );
  }

  private deriveScopes(models: Pick<ModelMeta, 'dbTable' | 'documentation'>[]): string[] {
    return models
      .filter((m) => !m.documentation?.includes('@internal'))
      .flatMap((m) => [`${m.dbTable}:read`, `${m.dbTable}:write`, `${m.dbTable}:*`]);
  }
}
