/**
 * Boot script that reads user preference values (theme mode, theme preset,
 * content layout, navbar style) from cookies or localStorage based on the
 * configured persistence mode.
 *
 * Runs early in <head> to apply the correct data attributes before hydration,
 * preventing layout or theme flicker and keeping RootLayout fully static.
 */
// @ts-expect-error -- Next.js script component type resolution
import Script from 'next/script';

export interface ThemeBootOptions {
  persistence?: Record<string, string>;
  defaults?: Record<string, string>;
}

export const DEFAULT_PREFERENCE_PERSISTENCE = {
  theme_mode: 'client-cookie',
  theme_preset: 'client-cookie',
  font: 'client-cookie',
  content_layout: 'client-cookie',
  navbar_style: 'client-cookie',
  sidebar_variant: 'client-cookie',
  sidebar_collapsible: 'client-cookie',
};

export const DEFAULT_PREFERENCE_DEFAULTS = {
  theme_mode: 'light',
  theme_preset: 'default',
  font: 'geist',
  content_layout: 'full-width',
  navbar_style: 'sticky',
  sidebar_variant: 'inset',
  sidebar_collapsible: 'icon',
};

export function ThemeBootScript({
  persistence: customPersistence,
  defaults: customDefaults,
}: ThemeBootOptions = {}) {
  const persistence = JSON.stringify({ ...DEFAULT_PREFERENCE_PERSISTENCE, ...customPersistence });
  const defaults = JSON.stringify({ ...DEFAULT_PREFERENCE_DEFAULTS, ...customDefaults });

  const code = `
    (function () {
      try {
        var root = document.documentElement;
        var PERSISTENCE = ${persistence};
        var DEFAULTS = ${defaults};

        function readCookie(name) {
          var match = document.cookie.split("; ").find(function(c) {
            return c.startsWith(name + "=");
          });
          return match ? decodeURIComponent(match.split("=")[1]) : null;
        }

        function readLocal(name) {
          try {
            return window.localStorage.getItem(name);
          } catch (e) {
            return null;
          }
        }

        function readPreference(key, fallback) {
          var mode = PERSISTENCE[key];
          var value = null;

          if (mode === "localStorage") {
            value = readLocal(key);
          }

          if (!value && (mode === "client-cookie" || mode === "server-cookie")) {
            value = readCookie(key);
          }

          if (!value || typeof value !== "string") {
            return fallback;
          }

          return value;
        }

        var rawMode = readPreference("theme_mode", DEFAULTS.theme_mode);
        var rawPreset = readPreference("theme_preset", DEFAULTS.theme_preset);
        var rawFont = readPreference("font", DEFAULTS.font);
        var rawContentLayout = readPreference("content_layout", DEFAULTS.content_layout);
        var rawNavbarStyle = readPreference("navbar_style", DEFAULTS.navbar_style);
        var rawSidebarVariant = readPreference("sidebar_variant", DEFAULTS.sidebar_variant);
        var rawSidebarCollapsible = readPreference("sidebar_collapsible", DEFAULTS.sidebar_collapsible);

        var isValidMode = rawMode === "dark" || rawMode === "light" || rawMode === "system";
        var mode = isValidMode ? rawMode : DEFAULTS.theme_mode;
        var resolvedMode =
          mode === "system" && window.matchMedia
            ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
            : mode;
        var preset = rawPreset || DEFAULTS.theme_preset;
        var font = rawFont || DEFAULTS.font;
        var contentLayout = rawContentLayout || DEFAULTS.content_layout;
        var navbarStyle = rawNavbarStyle || DEFAULTS.navbar_style;
        var sidebarVariant = rawSidebarVariant || DEFAULTS.sidebar_variant;
        var sidebarCollapsible = rawSidebarCollapsible || DEFAULTS.sidebar_collapsible;

        root.classList.toggle("dark", resolvedMode === "dark");
        root.setAttribute("data-theme-mode", mode);
        root.setAttribute("data-theme-preset", preset);
        root.setAttribute("data-font", font);
        root.setAttribute("data-content-layout", contentLayout);
        root.setAttribute("data-navbar-style", navbarStyle);
        root.setAttribute("data-sidebar-variant", sidebarVariant);
        root.setAttribute("data-sidebar-collapsible", sidebarCollapsible);

        root.style.colorScheme = resolvedMode === "dark" ? "dark" : "light";

      } catch (e) {
        console.warn("ThemeBootScript error:", e);
      }
    })();
  `;

  return (
    <Script
      id="theme-boot"
      strategy="beforeInteractive"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: required for pre-hydration boot script
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
