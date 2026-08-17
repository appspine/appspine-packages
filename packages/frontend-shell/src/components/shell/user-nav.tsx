'use client';

import { CircleUser, EllipsisVertical, LogOut } from 'lucide-react';

import { getInitials } from '../../lib/utils.js';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '../ui/sidebar.js';
import type { ShellLinkComponent } from './navigation.js';

export interface UserNavAdminMenu {
  readonly label: string;
  readonly url: string;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly LinkComponent: ShellLinkComponent;
}

export interface UserNavProps {
  readonly user: {
    readonly name: string;
    readonly email: string;
    readonly avatar?: string | null;
  };
  readonly onSignOut: () => void;
  readonly accountLabel?: string;
  readonly signOutLabel?: string;
  readonly adminMenu?: UserNavAdminMenu;
}

export function UserNav({
  user,
  onSignOut,
  accountLabel = 'Account',
  signOutLabel = 'Log out',
  adminMenu,
}: UserNavProps) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-muted-foreground text-xs">{user.email}</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-muted-foreground text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <CircleUser />
                {accountLabel}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {adminMenu && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <adminMenu.LinkComponent
                      href={adminMenu.url}
                      className="flex w-full items-center gap-2"
                    >
                      {adminMenu.icon && <adminMenu.icon className="size-4" />}
                      <span>{adminMenu.label}</span>
                    </adminMenu.LinkComponent>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut />
              {signOutLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
