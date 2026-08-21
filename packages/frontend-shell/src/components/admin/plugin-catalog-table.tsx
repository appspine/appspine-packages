'use client';

import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.js';

export type PluginBootOutcome = 'ready' | 'degraded-ready' | 'boot-aborted';
export type PluginStatus = 'ready' | 'degraded' | 'failed' | 'not-reached';

export interface PluginCatalogItem {
  key: string;
  pluginId: string;
  instanceId: string;
  package: string;
  digest: string;
  status: PluginStatus;
  required: boolean;
  provides: string[];
  requires: string[];
  unresolvedOptional: string[];
  startupMs: number;
  healthIndicatorId?: string;
  config?: unknown;
  error?: { stage: string; message: string };
}

export interface PluginCatalogSummary {
  outcome: PluginBootOutcome;
  order: string[];
  resolutionDigest?: string;
  plugins: PluginCatalogItem[];
  hostCapabilities?: string[];
}

export type PluginCatalogTableKey =
  | 'title'
  | 'subtitle'
  | 'empty'
  | 'columns.plugin'
  | 'columns.status'
  | 'columns.provides'
  | 'columns.requires'
  | 'columns.startup'
  | 'columns.actions'
  | 'inspect'
  | 'inspectTitle'
  | 'inspectDescription'
  | 'metrics.total'
  | 'metrics.ready'
  | 'metrics.degraded'
  | 'metrics.failed'
  | 'metrics.totalStartup';

export interface PluginCatalogTableProps {
  catalog: PluginCatalogSummary;
  t?: (key: PluginCatalogTableKey) => string;
}

const DEFAULT_LABELS: Record<PluginCatalogTableKey, string> = {
  title: 'Plugin Catalog & Health',
  subtitle: 'Runtime state, capabilities, and health status of installed Appspine plugins',
  empty: 'No plugins registered in the catalog',
  'columns.plugin': 'Plugin / Package',
  'columns.status': 'Status',
  'columns.provides': 'Provides',
  'columns.requires': 'Requires',
  'columns.startup': 'Startup',
  'columns.actions': 'Actions',
  inspect: 'Inspect',
  inspectTitle: 'Plugin Details',
  inspectDescription: 'Diagnostic and runtime descriptor for this plugin instance',
  'metrics.total': 'Total Plugins',
  'metrics.ready': 'Ready',
  'metrics.degraded': 'Degraded',
  'metrics.failed': 'Failed / Unreached',
  'metrics.totalStartup': 'Total Startup Time',
};

export function PluginCatalogTable({ catalog, t: customT }: PluginCatalogTableProps) {
  const t = (key: PluginCatalogTableKey): string => customT?.(key) ?? DEFAULT_LABELS[key] ?? key;
  const [inspectingPlugin, setInspectingPlugin] = useState<PluginCatalogItem | null>(null);

  const plugins = catalog.plugins ?? [];
  const readyCount = plugins.filter((p) => p.status === 'ready').length;
  const degradedCount = plugins.filter((p) => p.status === 'degraded').length;
  const failedCount = plugins.filter(
    (p) => p.status === 'failed' || p.status === 'not-reached',
  ).length;
  const totalStartup = plugins.reduce((acc, p) => acc + (p.startupMs || 0), 0);

  const renderStatusBadge = (status: PluginStatus) => {
    switch (status) {
      case 'ready':
        return (
          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
            <CheckCircle2 className="size-3" />
            <span>Ready</span>
          </Badge>
        );
      case 'degraded':
        return (
          <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white gap-1">
            <AlertTriangle className="size-3" />
            <span>Degraded</span>
          </Badge>
        );
      case 'failed':
      case 'not-reached':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="size-3" />
            <span>{status === 'failed' ? 'Failed' : 'Not Reached'}</span>
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderOutcomeBadge = (outcome: PluginBootOutcome) => {
    switch (outcome) {
      case 'ready':
        return (
          <Badge variant="default" className="bg-emerald-600 text-white gap-1 px-2.5 py-1 text-xs">
            <CheckCircle2 className="size-3.5" />
            <span>System Ready</span>
          </Badge>
        );
      case 'degraded-ready':
        return (
          <Badge variant="secondary" className="bg-amber-500 text-white gap-1 px-2.5 py-1 text-xs">
            <AlertTriangle className="size-3.5" />
            <span>System Degraded</span>
          </Badge>
        );
      case 'boot-aborted':
        return (
          <Badge variant="destructive" className="gap-1 px-2.5 py-1 text-xs">
            <XCircle className="size-3.5" />
            <span>Boot Aborted</span>
          </Badge>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-bold text-2xl tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
        </div>
        <div>{renderOutcomeBadge(catalog.outcome)}</div>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="rounded-lg border p-4 flex flex-col gap-1 bg-card">
          <span className="text-muted-foreground text-xs font-medium">{t('metrics.total')}</span>
          <span className="text-2xl font-bold">{plugins.length}</span>
        </div>
        <div className="rounded-lg border p-4 flex flex-col gap-1 bg-card">
          <span className="text-muted-foreground text-xs font-medium">{t('metrics.ready')}</span>
          <span className="text-2xl font-bold text-emerald-600">{readyCount}</span>
        </div>
        <div className="rounded-lg border p-4 flex flex-col gap-1 bg-card">
          <span className="text-muted-foreground text-xs font-medium">{t('metrics.degraded')}</span>
          <span className="text-2xl font-bold text-amber-500">{degradedCount}</span>
        </div>
        <div className="rounded-lg border p-4 flex flex-col gap-1 bg-card">
          <span className="text-muted-foreground text-xs font-medium">{t('metrics.failed')}</span>
          <span className="text-2xl font-bold text-rose-600">{failedCount}</span>
        </div>
        <div className="rounded-lg border p-4 flex flex-col gap-1 bg-card">
          <span className="text-muted-foreground text-xs font-medium">
            {t('metrics.totalStartup')}
          </span>
          <span className="text-2xl font-bold font-mono">{totalStartup}ms</span>
        </div>
      </section>

      <div className="rounded-lg border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.plugin')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.provides')}</TableHead>
              <TableHead>{t('columns.requires')}</TableHead>
              <TableHead>{t('columns.startup')}</TableHead>
              <TableHead className="text-right">{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plugins.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {plugins.map((plugin) => (
              <TableRow key={plugin.key}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-sm">{plugin.key}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {plugin.package}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{renderStatusBadge(plugin.status)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {plugin.provides.length === 0 ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : (
                      plugin.provides.map((cap) => (
                        <Badge key={cap} variant="secondary" className="font-mono text-[10px]">
                          {cap}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {plugin.requires.map((cap) => (
                      <Badge key={cap} variant="outline" className="font-mono text-[10px]">
                        {cap}
                      </Badge>
                    ))}
                    {plugin.unresolvedOptional?.map((cap) => (
                      <Badge
                        key={cap}
                        variant="outline"
                        className="font-mono text-[10px] opacity-60 border-dashed"
                      >
                        {cap} (optional)
                      </Badge>
                    ))}
                    {plugin.requires.length === 0 &&
                      (!plugin.unresolvedOptional || plugin.unresolvedOptional.length === 0) && (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {plugin.startupMs}ms
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => setInspectingPlugin(plugin)}
                  >
                    <Info className="size-3.5" />
                    {t('inspect')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(inspectingPlugin)}
        onOpenChange={(open) => !open && setInspectingPlugin(null)}
      >
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{inspectingPlugin?.key}</span>
              {inspectingPlugin && renderStatusBadge(inspectingPlugin.status)}
            </DialogTitle>
            <DialogDescription>{t('inspectDescription')}</DialogDescription>
          </DialogHeader>

          {inspectingPlugin && (
            <div className="flex flex-col gap-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground text-xs">Package</div>
                  <div className="font-mono font-medium text-xs mt-0.5">
                    {inspectingPlugin.package}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground text-xs">Instance ID</div>
                  <div className="font-mono font-medium text-xs mt-0.5">
                    {inspectingPlugin.instanceId}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground text-xs">Schema / Code Digest</div>
                  <div
                    className="font-mono text-[11px] truncate mt-0.5"
                    title={inspectingPlugin.digest}
                  >
                    {inspectingPlugin.digest}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground text-xs">Startup Duration</div>
                  <div className="font-mono font-medium text-xs mt-0.5">
                    {inspectingPlugin.startupMs}ms
                  </div>
                </div>
              </div>

              {inspectingPlugin.error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive flex flex-col gap-1">
                  <span className="font-semibold">
                    Error at stage: {inspectingPlugin.error.stage}
                  </span>
                  <span className="font-mono whitespace-pre-wrap">
                    {inspectingPlugin.error.message}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  Provided Capabilities
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {inspectingPlugin.provides.length === 0 ? (
                    <span className="text-xs text-muted-foreground">None</span>
                  ) : (
                    inspectingPlugin.provides.map((c) => (
                      <Badge key={c} variant="secondary" className="font-mono text-xs">
                        {c}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  Required Capabilities
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {inspectingPlugin.requires.length === 0 ? (
                    <span className="text-xs text-muted-foreground">None</span>
                  ) : (
                    inspectingPlugin.requires.map((c) => (
                      <Badge key={c} variant="outline" className="font-mono text-xs">
                        {c}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              {inspectingPlugin.unresolvedOptional &&
                inspectingPlugin.unresolvedOptional.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                      Unresolved Optional Capabilities
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {inspectingPlugin.unresolvedOptional.map((c) => (
                        <Badge
                          key={c}
                          variant="outline"
                          className="font-mono text-xs border-dashed opacity-75"
                        >
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {inspectingPlugin.config !== undefined && (
                <div className="flex flex-col gap-2">
                  <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                    Redacted Configuration
                  </span>
                  <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 text-xs font-mono">
                    {JSON.stringify(inspectingPlugin.config, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
