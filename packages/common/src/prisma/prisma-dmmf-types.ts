/**
 * Structural types for `Prisma.dmmf.datamodel`, which `@prisma/client` does not expose through
 * its public type surface. Shared by any package that needs to read a consuming app's generated
 * Prisma model/enum metadata at runtime (schema-drift checks, metadata-schema introspection)
 * without each one hand-rolling its own copy or falling back to `any`.
 */

export type DmmfField = {
  name: string;
  kind: string;
  type: string;
  isRequired: boolean;
  isList: boolean;
  dbName?: string | null;
  isId?: boolean;
  isUnique?: boolean;
  isUpdatedAt?: boolean;
  hasDefaultValue?: boolean;
  default?: unknown;
  documentation?: string;
  relationName?: string;
  relationFromFields?: readonly string[];
  relationToFields?: readonly string[];
};

export type DmmfModel = {
  name: string;
  dbName?: string | null;
  documentation?: string;
  fields: readonly DmmfField[];
  uniqueFields?: readonly (readonly string[])[];
  uniqueIndexes?: readonly { fields: readonly string[] }[];
  /** Prisma 6's public DMMF omits non-unique indexes at runtime; schema-aware fixtures may provide them. */
  indexes?: readonly { name?: string; fields: readonly string[] }[];
};

export type DmmfEnumValue = {
  name: string;
  documentation?: string;
};

export type DmmfEnum = {
  name: string;
  documentation?: string;
  values: readonly DmmfEnumValue[];
};

/**
 * Structurally compatible with `@prisma/client`'s `Prisma.dmmf.datamodel` (whose arrays are
 * `ReadonlyDeep`), so callers can pass it straight through without casting.
 */
export type PrismaDmmfDatamodel = {
  models: readonly DmmfModel[];
  enums: readonly DmmfEnum[];
};
