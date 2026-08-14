import { describe, expect, it } from 'vitest';
import { buildListHref, buildSortHref, formatPageInfo, parseSortOrder } from './list-url.js';

describe('list-url utilities', () => {
  it('builds href with page, search, and sort', () => {
    const href = buildListHref({ search: 'test', sortField: 'name', sortOrder: 'ASC' }, 2);
    expect(href).toBe('?page=2&search=test&sortField=name&sortOrder=ASC');
  });

  it('builds sort href resetting to page 1', () => {
    const href = buildSortHref({ search: 'query' }, 'createdAt', 'DESC');
    expect(href).toBe('?page=1&search=query&sortField=createdAt&sortOrder=DESC');
  });

  it('parses sort order correctly', () => {
    expect(parseSortOrder('ASC')).toBe('ASC');
    expect(parseSortOrder('DESC')).toBe('DESC');
    expect(parseSortOrder('INVALID')).toBeUndefined();
    expect(parseSortOrder(undefined)).toBeUndefined();
  });

  it('formats page info templates', () => {
    const text = formatPageInfo('Page {page} of {totalPages} (Total: {total})', {
      page: 1,
      totalPages: 5,
      total: 50,
    });
    expect(text).toBe('Page 1 of 5 (Total: 50)');
  });
});
