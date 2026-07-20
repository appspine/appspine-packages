'use client';

import { Fragment } from 'react';

import { useTranslations } from '../../i18n/index.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb.js';

export type BreadcrumbSegments = readonly string[];

export type DynamicBreadcrumbPrefix = readonly [prefix: string, segments: BreadcrumbSegments];

export interface HeaderBreadcrumbsProps {
  labels: Record<string, BreadcrumbSegments>;
  pathname: string;
  dynamicPrefixes?: readonly DynamicBreadcrumbPrefix[];
  namespace?: string;
  listClassName?: string;
}

function resolveSegments(
  pathname: string,
  labels: Record<string, BreadcrumbSegments>,
  dynamicPrefixes: readonly DynamicBreadcrumbPrefix[],
): BreadcrumbSegments | undefined {
  const exact = labels[pathname];
  if (exact) return exact;

  for (const [prefix, segments] of dynamicPrefixes) {
    if (pathname.startsWith(prefix) && !pathname.slice(prefix.length).includes('/')) {
      return segments;
    }
  }

  return undefined;
}

export function HeaderBreadcrumbs({
  labels,
  pathname,
  dynamicPrefixes = [],
  namespace = 'breadcrumb',
  listClassName = 'flex-nowrap',
}: HeaderBreadcrumbsProps) {
  const t = useTranslations(namespace);
  const segments = resolveSegments(pathname, labels, dynamicPrefixes);
  if (!segments) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList className={listClassName}>
        {segments.map((segment, index) => (
          <Fragment key={segment}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {index === segments.length - 1 ? (
                <BreadcrumbPage>{t(segment)}</BreadcrumbPage>
              ) : (
                <span>{t(segment)}</span>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
