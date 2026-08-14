import type { SortOrder } from '../components/sortable-column-header.js';

export interface ListUrlState {
  search?: string;
  sortField?: string;
  sortOrder?: SortOrder;
}

export function buildListHref(state: ListUrlState, page: number): string {
  const params = new URLSearchParams({ page: String(page) });
  if (state.search) params.set('search', state.search);
  if (state.sortField) params.set('sortField', state.sortField);
  if (state.sortOrder) params.set('sortOrder', state.sortOrder);
  return `?${params}`;
}

export function buildSortHref<TField extends string>(
  state: { search?: string },
  field: TField,
  order: SortOrder,
): string {
  return buildListHref({ search: state.search, sortField: field, sortOrder: order }, 1);
}

export function parseSortOrder(value?: string): SortOrder | undefined {
  return value === 'ASC' || value === 'DESC' ? value : undefined;
}

export function formatPageInfo(
  template: string,
  values: { page: number; totalPages: number; total: number },
): string {
  return template
    .replaceAll('{page}', String(values.page))
    .replaceAll('{totalPages}', String(values.totalPages))
    .replaceAll('{total}', String(values.total));
}
