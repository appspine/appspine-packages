'use client';

import { Command } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../ui/sidebar';
import { NavMain } from './nav-main';
import type { NavGroup, ShellLinkComponent } from './navigation';
import { SidebarResizer } from './sidebar-resizer';
import { UserNav } from './user-nav';

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
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
}

export function AppSidebar({
  appName,
  currentPath,
  navItems,
  LinkComponent,
  user,
  onSignOut,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar {...props} className="relative">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <LinkComponent href="/dashboard">
                <Command />
                <span className="font-semibold text-base">{appName}</span>
              </LinkComponent>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} currentPath={currentPath} LinkComponent={LinkComponent} />
      </SidebarContent>
      <SidebarFooter>
        <UserNav user={user} onSignOut={onSignOut} />
      </SidebarFooter>
      <SidebarResizer />
    </Sidebar>
  );
}
