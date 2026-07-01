'use client';

import * as React from 'react';

import { useSidebar } from '../ui/sidebar.js';

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const KEYBOARD_STEP = 10;

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

export function SidebarResizer() {
  const { state, isMobile } = useSidebar();
  const [isDragging, setIsDragging] = React.useState(false);
  const [width, setWidth] = React.useState(240);

  const setPersistedWidth = React.useCallback((nextWidth: number) => {
    const clampedWidth = clampWidth(nextWidth);
    setWidth(clampedWidth);
    localStorage.setItem('sidebar_width', clampedWidth.toString());
  }, []);

  React.useEffect(() => {
    const savedWidth = localStorage.getItem('sidebar_width');

    if (!savedWidth) {
      return;
    }

    const parsedWidth = parseInt(savedWidth, 10);
    if (!Number.isNaN(parsedWidth) && parsedWidth >= MIN_WIDTH && parsedWidth <= MAX_WIDTH) {
      setWidth(parsedWidth);
    }
  }, []);

  React.useEffect(() => {
    if (isMobile || state === 'collapsed') {
      return;
    }

    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
    if (wrapper instanceof HTMLElement) {
      wrapper.style.setProperty('--sidebar-width', `${width}px`);
    }
  }, [isMobile, state, width]);

  const startResize = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  React.useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const container = document.querySelector('[data-slot="sidebar-container"]');
      const offsetLeft =
        container instanceof HTMLElement ? container.getBoundingClientRect().left : 0;
      setPersistedWidth(event.clientX - offsetLeft);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setPersistedWidth]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPersistedWidth(width - KEYBOARD_STEP);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPersistedWidth(width + KEYBOARD_STEP);
      }
    },
    [setPersistedWidth, width],
  );

  if (isMobile || state === 'collapsed') {
    return null;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable drag handle cannot use <hr> because the splitter needs keyboard/mouse interaction
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      tabIndex={0}
      onMouseDown={startResize}
      onKeyDown={handleKeyDown}
      className="group/resizer absolute top-0 -right-1 bottom-0 z-50 w-2 cursor-col-resize select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      style={{ touchAction: 'none' }}
    >
      <div
        className={`mx-auto h-full w-[2px] transition-colors duration-200 ${
          isDragging ? 'bg-primary' : 'bg-transparent group-hover/resizer:bg-primary/40'
        }`}
      />
    </div>
  );
}
