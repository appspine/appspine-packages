import { z } from 'zod';

export const SORT_ORDERS = ['ASC', 'DESC'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortField: z.string().min(1).optional(),
  sortOrder: z
    .preprocess((v: unknown) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(SORT_ORDERS))
    .optional(),
  search: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function paginate<T>(data: T[], total: number): PaginatedResult<T> {
  return { data, total };
}

export function toPrismaPage(query: Pick<PaginationQuery, 'page' | 'limit'>): {
  skip: number;
  take: number;
} {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return { skip: (page - 1) * limit, take: limit };
}

/** defaultOrderBy must have exactly ONE key — Prisma 6 does not accept multi-key orderBy objects. */
export function toPrismaOrderBy(
  query: Pick<PaginationQuery, 'sortField' | 'sortOrder'>,
  allowedFields: readonly string[],
  defaultOrderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' },
): Record<string, 'asc' | 'desc'> {
  if (query.sortField && allowedFields.includes(query.sortField)) {
    return { [query.sortField]: query.sortOrder === 'ASC' ? 'asc' : 'desc' };
  }
  return defaultOrderBy;
}
