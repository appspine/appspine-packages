import { describe, expect, it } from 'vitest';
import {
  type PaginationQuery,
  paginationQuerySchema,
  toPrismaOrderBy,
  toPrismaPage,
  toPrismaSortDirection,
} from './pagination';

describe('pagination', () => {
  describe('paginationQuerySchema', () => {
    it('should parse with default values when empty object is passed', () => {
      const parsed = paginationQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toEqual({
          page: 1,
          limit: 20,
        });
      }
    });

    it('should enforce bounds and validation errors', () => {
      // page 0 is invalid
      const parsedPageZero = paginationQuerySchema.safeParse({ page: 0 });
      expect(parsedPageZero.success).toBe(false);

      // page -1 is invalid
      const parsedPageNegative = paginationQuerySchema.safeParse({ page: -1 });
      expect(parsedPageNegative.success).toBe(false);

      // limit 101 is invalid
      const parsedLimitTooHigh = paginationQuerySchema.safeParse({ limit: 101 });
      expect(parsedLimitTooHigh.success).toBe(false);
    });

    it('should coerce string values into numbers', () => {
      const parsed = paginationQuerySchema.safeParse({ page: '3', limit: '50' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(3);
        expect(parsed.data.limit).toBe(50);
      }
    });

    it('should preprocess and normalize sortOrder', () => {
      // Lowercase string gets converted to uppercase
      const parsedAsc = paginationQuerySchema.safeParse({ sortOrder: 'asc' });
      expect(parsedAsc.success).toBe(true);
      if (parsedAsc.success) {
        expect(parsedAsc.data.sortOrder).toBe('ASC');
      }

      // Uppercase remains uppercase
      const parsedDesc = paginationQuerySchema.safeParse({ sortOrder: 'DESC' });
      expect(parsedDesc.success).toBe(true);
      if (parsedDesc.success) {
        expect(parsedDesc.data.sortOrder).toBe('DESC');
      }

      // Invalid value fails
      const parsedInvalid = paginationQuerySchema.safeParse({ sortOrder: 'sideways' });
      expect(parsedInvalid.success).toBe(false);
    });
  });

  describe('toPrismaPage', () => {
    it('should compute correct skip and take', () => {
      expect(toPrismaPage({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
      expect(toPrismaPage({ page: 1, limit: 10 })).toEqual({ skip: 0, take: 10 });
    });

    it('should fall back to defaults if page/limit are missing', () => {
      // We pass partial objects since the signature takes Pick<PaginationQuery, 'page' | 'limit'>
      expect(toPrismaPage({} as Pick<PaginationQuery, 'page' | 'limit'>)).toEqual({
        skip: 0,
        take: 20,
      });
    });
  });

  describe('toPrismaSortDirection', () => {
    it('should return asc for ASC, desc for DESC or undefined', () => {
      expect(toPrismaSortDirection('ASC')).toBe('asc');
      expect(toPrismaSortDirection('DESC')).toBe('desc');
      expect(toPrismaSortDirection(undefined)).toBe('desc');
    });
  });

  describe('toPrismaOrderBy', () => {
    const ALLOWED = ['name', 'createdAt'];

    it('should build orderBy object if field is allowed', () => {
      expect(toPrismaOrderBy({ sortField: 'name', sortOrder: 'ASC' }, ALLOWED)).toEqual({
        name: 'asc',
      });
      expect(toPrismaOrderBy({ sortField: 'createdAt', sortOrder: 'DESC' }, ALLOWED)).toEqual({
        createdAt: 'desc',
      });
    });

    it('should return defaultOrderBy if sortField is not in allowed list', () => {
      expect(toPrismaOrderBy({ sortField: 'secretField', sortOrder: 'ASC' }, ALLOWED)).toEqual({
        createdAt: 'desc',
      });
    });

    it('should accept custom defaultOrderBy', () => {
      const customDefault = { id: 'asc' as const };
      expect(
        toPrismaOrderBy({ sortField: 'secretField', sortOrder: 'ASC' }, ALLOWED, customDefault),
      ).toEqual(customDefault);
    });
  });
});
