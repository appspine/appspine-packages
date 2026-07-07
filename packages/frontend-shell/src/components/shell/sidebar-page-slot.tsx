'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const SIDEBAR_PAGE_SLOT_ID = 'app-sidebar-page-slot';

/** Rendered once by AppSidebar; empty and invisible until a page portals content into it. */
export function SidebarPageSlot() {
  return <div id={SIDEBAR_PAGE_SLOT_ID} className="flex min-h-0 flex-1 flex-col" />;
}

/** Used by page-level components to render into the persistent app sidebar (see SidebarPageSlot). */
export function SidebarPagePortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const findTarget = () => {
      const el = document.getElementById(SIDEBAR_PAGE_SLOT_ID);
      setTarget((current) => (current === el ? current : el));
    };

    findTarget();

    // The sidebar swaps between two entirely separate JSX branches for the
    // desktop and mobile (Sheet) presentations, so the slot re-mounts as a new
    // DOM node whenever that breakpoint is crossed, even though this component
    // itself never unmounts. Re-resolve the target whenever that happens.
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  if (!target) {
    return null;
  }

  return createPortal(children, target);
}
