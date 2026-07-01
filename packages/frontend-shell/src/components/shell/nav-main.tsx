'use client';

import { ChevronRight } from 'lucide-react';

import { cn } from '../../lib/utils.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.js';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '../ui/sidebar.js';
import type {
  NavBadge,
  NavGroup,
  NavMainItem,
  NavMainLinkItem,
  NavMainParentItem,
  ShellLinkComponent,
} from './navigation.js';

interface NavMainProps {
  readonly items: readonly NavGroup[];
  readonly currentPath: string;
  readonly LinkComponent: ShellLinkComponent;
}

interface NavItemProps {
  readonly item: NavMainItem;
  readonly LinkComponent: ShellLinkComponent;
  readonly isItemActive: (item: NavMainItem) => boolean;
  readonly isSubItemActive: (url: string) => boolean;
  readonly isSubmenuOpen: (item: NavMainParentItem) => boolean;
}

function hasSubItems(item: NavMainItem): item is NavMainParentItem {
  return Boolean(item.subItems?.length);
}

function isPathWithin(currentPath: string, url: string) {
  return currentPath === url || currentPath.startsWith(`${url}/`);
}

function CollapsedIconFallback({ title }: { title: string }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-xs font-medium text-[10px] outline">
      {title.slice(0, 1)}
    </span>
  );
}

export function NavMain({ items, currentPath, LinkComponent }: NavMainProps) {
  const isItemActive = (item: NavMainItem) => {
    if (hasSubItems(item)) {
      return item.subItems.some((subItem) => isPathWithin(currentPath, subItem.url));
    }

    return currentPath === item.url;
  };

  const isSubItemActive = (url: string) => currentPath === url;
  const isSubmenuOpen = (item: NavMainParentItem) =>
    item.subItems.some((subItem) => isPathWithin(currentPath, subItem.url));

  return (
    <>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label ? (
            <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  LinkComponent={LinkComponent}
                  isItemActive={isItemActive}
                  isSubItemActive={isSubItemActive}
                  isSubmenuOpen={isSubmenuOpen}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function NavItem({
  item,
  LinkComponent,
  isItemActive,
  isSubItemActive,
  isSubmenuOpen,
}: NavItemProps) {
  const { state, isMobile } = useSidebar();
  const isCollapsedDesktop = state === 'collapsed' && !isMobile;

  if (!hasSubItems(item)) {
    return (
      <NavLinkItem
        item={item}
        LinkComponent={LinkComponent}
        isActive={isItemActive(item)}
        showIconFallback={isCollapsedDesktop}
      />
    );
  }

  if (isCollapsedDesktop) {
    return (
      <NavDropdownItem
        item={item}
        LinkComponent={LinkComponent}
        isActive={isItemActive(item)}
        isSubItemActive={isSubItemActive}
      />
    );
  }

  return (
    <NavCollapsibleItem
      item={item}
      LinkComponent={LinkComponent}
      isActive={isItemActive(item)}
      defaultOpen={isSubmenuOpen(item)}
      isSubItemActive={isSubItemActive}
    />
  );
}

function NavLinkItem({
  item,
  LinkComponent,
  isActive,
  showIconFallback,
}: {
  item: NavMainLinkItem;
  LinkComponent: ShellLinkComponent;
  isActive: boolean;
  showIconFallback: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        aria-disabled={item.disabled}
        tooltip={item.title}
        isActive={isActive}
      >
        <LinkComponent
          href={item.url}
          target={item.newTab ? '_blank' : undefined}
          rel={item.newTab ? 'noreferrer' : undefined}
        >
          <NavLinkIcon item={item} showFallback={showIconFallback} />
          <span>{item.title}</span>
        </LinkComponent>
      </SidebarMenuButton>
      <NavItemBadge badge={item.badge} />
    </SidebarMenuItem>
  );
}

function NavLinkIcon({ item, showFallback }: { item: NavMainLinkItem; showFallback: boolean }) {
  const Icon = item.icon;

  if (Icon) {
    return <Icon />;
  }

  if (showFallback) {
    return <CollapsedIconFallback title={item.title} />;
  }

  return null;
}

function NavDropdownItem({
  item,
  LinkComponent,
  isActive,
  isSubItemActive,
}: {
  item: NavMainParentItem;
  LinkComponent: ShellLinkComponent;
  isActive: boolean;
  isSubItemActive: (url: string) => boolean;
}) {
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={isActive} disabled={item.disabled}>
            {Icon ? <Icon /> : <CollapsedIconFallback title={item.title} />}
            <span>{item.title}</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-48">
          <DropdownMenuGroup>
            {item.subItems.map((subItem) => {
              const SubIcon = subItem.icon;

              return (
                <DropdownMenuItem key={subItem.id} asChild disabled={subItem.disabled}>
                  <LinkComponent
                    href={subItem.url}
                    target={subItem.newTab ? '_blank' : undefined}
                    rel={subItem.newTab ? 'noreferrer' : undefined}
                    aria-current={isSubItemActive(subItem.url) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2',
                      isSubItemActive(subItem.url) ? 'font-medium' : undefined,
                    )}
                  >
                    {SubIcon ? <SubIcon /> : null}
                    <span>{subItem.title}</span>
                  </LinkComponent>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function NavCollapsibleItem({
  item,
  LinkComponent,
  isActive,
  defaultOpen,
  isSubItemActive,
}: {
  item: NavMainParentItem;
  LinkComponent: ShellLinkComponent;
  isActive: boolean;
  defaultOpen: boolean;
  isSubItemActive: (url: string) => boolean;
}) {
  const Icon = item.icon;

  return (
    <Collapsible asChild defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={isActive} disabled={item.disabled}>
            {Icon ? <Icon /> : null}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <NavItemBadge badge={item.badge} />
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.subItems.map((subItem) => {
              const SubIcon = subItem.icon;

              return (
                <SidebarMenuSubItem key={subItem.id}>
                  <SidebarMenuSubButton
                    asChild
                    aria-disabled={subItem.disabled}
                    isActive={isSubItemActive(subItem.url)}
                  >
                    <LinkComponent
                      href={subItem.url}
                      target={subItem.newTab ? '_blank' : undefined}
                      rel={subItem.newTab ? 'noreferrer' : undefined}
                    >
                      {SubIcon ? <SubIcon /> : null}
                      <span>{subItem.title}</span>
                    </LinkComponent>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function NavItemBadge({ badge }: { badge?: NavBadge }) {
  if (!badge) {
    return null;
  }

  return (
    <SidebarMenuBadge
      className={cn(
        'rounded-sm border capitalize',
        badge === 'new' &&
          'border-green-600 text-green-600 peer-hover/menu-button:text-green-600 peer-data-active/menu-button:text-green-600',
        badge === 'soon' && 'border-muted-foreground text-muted-foreground',
      )}
    >
      {badge}
    </SidebarMenuBadge>
  );
}
