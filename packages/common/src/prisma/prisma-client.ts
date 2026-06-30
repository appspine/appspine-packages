import { createRequire } from 'node:module';

// Resolve @prisma/client from the consuming app's CWD so PrismaService binds to
// that app's own generated client (its own models, its own DB connection) —
// each business system owns an independent database (dev_docs 001).
// biome-ignore lint/suspicious/noExplicitAny: dynamically resolved from consuming app
const _module: any = createRequire(`${process.cwd()}/package.json`)('@prisma/client');

// biome-ignore lint/suspicious/noExplicitAny: concrete class provided by consuming app
export const BasePrismaClient: new (...args: any[]) => any = _module.PrismaClient;
// biome-ignore lint/suspicious/noExplicitAny: Prisma namespace (dmmf, enums, etc.) from consuming app
export const Prisma: any = _module.Prisma;
