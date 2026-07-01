import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import * as React from 'react';
import { Button } from './ui/button.js';

export type SortOrder = 'ASC' | 'DESC';

interface SortableColumnHeaderProps<TField extends string> {
  readonly label: string;
  readonly field: TField;
  readonly currentSortField?: string;
  readonly currentSortOrder?: SortOrder;
  readonly LinkComponent: React.ComponentType<{
    href: string;
    children: React.ReactNode;
    className?: string;
  }>;
  readonly buildSortHref: (field: TField, order: SortOrder) => string;
}

/**
 * Renders a clickable column header that toggles server-side sort via a URL, mirroring
 * ListPagination's Link-based navigation. `TField` should be a page-local sortable-field union
 * (e.g. `"displayName" | "userCount"`) so a typo'd/renamed field fails to typecheck against the
 * page's own `buildSortHref` instead of silently falling through to the backend's default sort.
 */
export function SortableColumnHeader<TField extends string>({
  label,
  field,
  currentSortField,
  currentSortOrder,
  LinkComponent,
  buildSortHref,
}: SortableColumnHeaderProps<TField>) {
  const isActive = currentSortField === field;
  const nextOrder: SortOrder = isActive && currentSortOrder === 'ASC' ? 'DESC' : 'ASC';
  const Icon = isActive ? (currentSortOrder === 'ASC' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2.5 h-8">
      <LinkComponent href={buildSortHref(field, nextOrder)}>
        {label}
        <Icon className="size-3.5" />
      </LinkComponent>
    </Button>
  );
}
