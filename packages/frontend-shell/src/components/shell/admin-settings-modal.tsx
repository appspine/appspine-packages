'use client';

import { AlertCircle, RefreshCw, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '../ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../ui/dialog.js';
import { Skeleton } from '../ui/skeleton.js';
import type { ShellLinkComponent } from './navigation.js';

export interface AdminModalNavItem {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly icon?: React.ComponentType<{ className?: string }>;
}

export interface AdminSettingsModalProps {
  readonly title: string;
  readonly navItems: readonly AdminModalNavItem[];
  readonly activeId: string;
  readonly onClose: () => void;
  readonly LinkComponent: ShellLinkComponent;
  readonly children: React.ReactNode;
  readonly loadingFallback?: React.ReactNode;
  readonly errorFallback?: (retry: () => void) => React.ReactNode;
  readonly labels?: Partial<AdminSettingsModalLabels>;
  readonly onRetry?: () => void;
}

export interface AdminSettingsModalLabels {
  readonly close: string;
  readonly description: string;
  readonly loading: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
}

const DEFAULT_LABELS: AdminSettingsModalLabels = {
  close: 'Close administration settings',
  description: 'Navigate administration settings and manage the selected section.',
  loading: 'Loading',
  errorTitle: 'Unable to load this section',
  errorDescription:
    'Something went wrong while loading this administration section. Try again or choose another section from the navigation.',
  retry: 'Try again',
};

interface ModalErrorBoundaryProps {
  readonly children: React.ReactNode;
  readonly fallback: (retry: () => void) => React.ReactNode;
  readonly activeId: string;
  readonly onRetry?: () => void;
}

interface ModalErrorBoundaryState {
  readonly error: Error | null;
}

class ModalErrorBoundary extends React.Component<ModalErrorBoundaryProps, ModalErrorBoundaryState> {
  state: ModalErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModalErrorBoundaryState {
    return { error };
  }

  private readonly retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  componentDidUpdate(previousProps: ModalErrorBoundaryProps) {
    if (
      this.state.error &&
      (previousProps.activeId !== this.props.activeId ||
        previousProps.children !== this.props.children)
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.retry);
    }

    return this.props.children;
  }
}

function DefaultLoadingFallback({ label }: { readonly label: string }) {
  return (
    <div className="space-y-6 p-6" role="status" aria-busy="true" aria-label={label}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="rounded-xl border bg-card p-5 shadow-xs">
        <div className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

function DefaultErrorFallback({
  labels,
  retry,
}: {
  readonly labels: AdminSettingsModalLabels;
  readonly retry: () => void;
}) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-medium text-foreground">{labels.errorTitle}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{labels.errorDescription}</p>
          </div>
        </div>
        <Button className="mt-5" variant="outline" onClick={retry}>
          <RefreshCw aria-hidden="true" />
          {labels.retry}
        </Button>
      </div>
    </div>
  );
}

export function AdminSettingsModal({
  title,
  navItems,
  activeId,
  onClose,
  LinkComponent,
  children,
  loadingFallback,
  errorFallback,
  labels,
  onRetry,
}: AdminSettingsModalProps) {
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Wider than the sm:max-w-4xl originally reviewed for this component (knowledge/decisions/
          050-mcp-gateway-sidebar-modal-task-breakdown.md S2-1): the admin tables rendered inside
          (audit logs, API keys) need more horizontal room than a fixed 896px allows before their
          columns wrap awkwardly. min(96vw, 1840px) still caps out well short of full-bleed. */}
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:w-[min(96vw,1840px)] sm:max-w-none"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{resolvedLabels.description}</DialogDescription>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
          <aside className="flex max-h-48 w-full shrink-0 flex-col border-b bg-muted/20 md:max-h-none md:w-56 md:border-r md:border-b-0">
            <div className="flex h-11 shrink-0 items-center border-b px-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {title}
              </p>
            </div>
            <nav
              className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-2 md:overflow-y-auto"
              aria-label={title}
            >
              <ul className="flex min-w-max gap-1 md:flex-col">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === activeId;

                  return (
                    <li key={item.id} className="min-w-[9rem] md:min-w-0">
                      <Button
                        asChild
                        variant={isActive ? 'secondary' : 'ghost'}
                        size="sm"
                        className="w-full justify-start gap-2 whitespace-nowrap"
                      >
                        <LinkComponent href={item.url} aria-current={isActive ? 'page' : undefined}>
                          {Icon ? <Icon aria-hidden="true" /> : null}
                          <span>{item.title}</span>
                        </LinkComponent>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <div className="flex h-11 shrink-0 items-center justify-end border-b px-3 sm:px-4">
              <DialogClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label={resolvedLabels.close}>
                  <X aria-hidden="true" />
                </Button>
              </DialogClose>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <React.Suspense
                fallback={
                  loadingFallback ?? <DefaultLoadingFallback label={resolvedLabels.loading} />
                }
              >
                <ModalErrorBoundary
                  activeId={activeId}
                  fallback={
                    errorFallback ??
                    ((retry) => <DefaultErrorFallback labels={resolvedLabels} retry={retry} />)
                  }
                  onRetry={onRetry}
                >
                  {children}
                </ModalErrorBoundary>
              </React.Suspense>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
