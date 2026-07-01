import * as React from 'react';
import { Button } from './ui/button.js';

interface ListPaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  readonly LinkComponent: React.ComponentType<{
    href: string;
    children: React.ReactNode;
    className?: string;
  }>;
  readonly buildPageHref: (page: number) => string;
  readonly previousText?: string;
  readonly nextText?: string;
  readonly infoText?: string;
}

export function ListPagination({
  page,
  totalPages,
  total,
  LinkComponent,
  buildPageHref,
  previousText = 'Previous',
  nextText = 'Next',
  infoText,
}: ListPaginationProps) {
  const renderedInfoText = infoText ?? `Page ${page} of ${totalPages} (${total} total)`;

  return (
    <div className="flex items-center justify-between text-muted-foreground text-sm">
      <span>{renderedInfoText}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <LinkComponent href={buildPageHref(page - 1)}>{previousText}</LinkComponent>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {previousText}
          </Button>
        )}
        {page < totalPages ? (
          <Button asChild variant="outline" size="sm">
            <LinkComponent href={buildPageHref(page + 1)}>{nextText}</LinkComponent>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {nextText}
          </Button>
        )}
      </div>
    </div>
  );
}
