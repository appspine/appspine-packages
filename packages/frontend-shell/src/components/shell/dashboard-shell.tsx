import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/utils.js';
import { Separator } from '../ui/separator.js';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../ui/sidebar.js';
import { AppSidebar } from './app-sidebar.js';
import type { NavGroup, ShellLinkComponent } from './navigation.js';
import type { UserNavAdminMenu } from './user-nav.js';

export interface DashboardShellProps {
  readonly appName: string;
  readonly currentPath: string;
  readonly navItems: readonly NavGroup[];
  readonly LinkComponent: ShellLinkComponent;
  readonly user: {
    readonly name: string;
    readonly email: string;
    readonly avatar?: string | null;
  };
  readonly onSignOut: () => void;
  readonly accountLabel?: string;
  readonly signOutLabel?: string;
  readonly adminMenu?: UserNavAdminMenu;
  readonly defaultOpen: boolean;
  readonly sidebarVariant: 'sidebar' | 'floating' | 'inset';
  readonly sidebarCollapsible: 'offcanvas' | 'icon' | 'none';
  readonly headerContent: ReactNode;
  readonly headerActions?: ReactNode;
  readonly children: ReactNode;
}

export function DashboardShell({
  appName,
  currentPath,
  navItems,
  LinkComponent,
  user,
  onSignOut,
  accountLabel,
  signOutLabel,
  adminMenu,
  defaultOpen,
  sidebarVariant,
  sidebarCollapsible,
  headerContent,
  headerActions,
  children,
}: DashboardShellProps) {
  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          '--sidebar-width': '240px',
        } as CSSProperties
      }
    >
      <AppSidebar
        appName={appName}
        currentPath={currentPath}
        navItems={navItems}
        LinkComponent={LinkComponent}
        user={user}
        onSignOut={onSignOut}
        accountLabel={accountLabel}
        signOutLabel={signOutLabel}
        adminMenu={adminMenu}
        variant={sidebarVariant}
        collapsible={sidebarCollapsible}
      />
      <SidebarInset
        className={cn(
          '[html[data-content-layout=centered]_&>*]:mx-auto',
          '[html[data-content-layout=centered]_&>*]:w-full',
          '[html[data-content-layout=centered]_&>*]:max-w-screen-2xl',
          'peer-data-[variant=inset]:border',
          '[--dashboard-header-height:--spacing(12)]',
          'min-w-0 overflow-x-hidden',
        )}
      >
        <header
          className={cn(
            'flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12',
            '[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md',
          )}
        >
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              {headerContent}
            </div>
            <div className="flex items-center gap-2">{headerActions}</div>
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
