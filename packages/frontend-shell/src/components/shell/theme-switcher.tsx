'use client';

import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '../ui/button.js';

const THEME_CYCLE = ['light', 'dark', 'system'] as const;

export type ThemeMode = (typeof THEME_CYCLE)[number];

interface ThemeSwitcherProps {
  readonly themeMode: ThemeMode;
  readonly onThemeModeChange: (nextThemeMode: ThemeMode) => void;
}

export function ThemeSwitcher({ themeMode, onThemeModeChange }: ThemeSwitcherProps) {
  const cycleTheme = () => {
    const currentIndex = THEME_CYCLE.indexOf(themeMode);
    const nextThemeMode = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];

    onThemeModeChange(nextThemeMode);
  };

  return (
    <Button
      size="icon"
      onClick={cycleTheme}
      aria-label={`Current theme: ${themeMode}. Click to cycle themes`}
    >
      <Monitor className="hidden [html[data-theme-mode=system]_&]:block" />
      <Sun className="hidden dark:block [html[data-theme-mode=system]_&]:hidden" />
      <Moon className="block dark:hidden [html[data-theme-mode=system]_&]:hidden" />
    </Button>
  );
}
