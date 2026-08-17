'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import {
  type AdminModalNavItem,
  AdminSettingsModal,
  type AdminSettingsModalLabels,
} from './admin-settings-modal.js';
import type { ShellLinkComponent } from './navigation.js';

export interface AdminModalShellProps {
  readonly title: string;
  readonly navItems: readonly AdminModalNavItem[];
  readonly activeId: string;
  readonly LinkComponent: ShellLinkComponent;
  readonly children: React.ReactNode;
  readonly labels?: Partial<AdminSettingsModalLabels>;
  readonly onClose?: () => void;
  readonly onRetry?: () => void;
  readonly loadingFallback?: React.ReactNode;
  readonly errorFallback?: (retry: () => void) => React.ReactNode;
}

/**
 * Higher-level client shell for intercepting admin modal routes.
 * Automatically resolves activeId by matching pathname prefixes and defaults
 * onClose to router.back() and onRetry to router.refresh().
 */
export function AdminModalShell({
  title,
  navItems,
  activeId,
  LinkComponent,
  children,
  labels,
  onClose,
  onRetry,
  loadingFallback,
  errorFallback,
}: AdminModalShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const resolvedActiveId =
    navItems.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`))?.id ??
    activeId;

  return (
    <AdminSettingsModal
      title={title}
      navItems={navItems}
      activeId={resolvedActiveId}
      onClose={onClose ?? (() => router.back())}
      onRetry={onRetry ?? (() => router.refresh())}
      LinkComponent={LinkComponent}
      labels={labels}
      loadingFallback={loadingFallback}
      errorFallback={errorFallback}
    >
      {children}
    </AdminSettingsModal>
  );
}
