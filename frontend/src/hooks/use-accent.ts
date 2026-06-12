/**
 * useAccent — manages the user's preferred theme (accent + surface tones).
 *
 * Each preset defines a full set of light/dark CSS custom properties:
 * primary (the accent color), surface tones (secondary, muted, accent, border),
 * and the background. Persisted to backend via PUT /auth/preferences.
 *
 * A MutationObserver on <html>.classList keeps the applied colors in sync
 * when the .dark class toggles.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

/* ─── Theme preset definitions ────────────────────────── */

export interface ThemeDefinition {
  label: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export interface ThemeColors {
  /* surfaces */
  background: string;
  /** card / popover stay pure white — defined here for completeness */
  card: string;
  cardForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  /* strokes */
  border: string;
  input: string;
  /* primary (the accent) */
  primary: string;
  primaryForeground: string;
  ring: string;
}

/* ── Internal: build a surface row from an accent hue ─── */

function surface(hue: number, L_light: number, L_dark: number, C = 0.015) {
  return {
    light: {
      secondary:          `oklch(${L_light} ${C} ${hue})`,
      muted:              `oklch(${L_light} ${C} ${hue})`,
      accent:             `oklch(${L_light - 0.02} ${C + 0.008} ${hue})`,
      border:             `oklch(${L_light - 0.07} ${C} ${hue})`,
      input:              `oklch(${L_light - 0.07} ${C} ${hue})`,
    },
    dark: {
      secondary:          `oklch(${L_dark} 0.025 ${hue})`,
      muted:              `oklch(${L_dark} 0.025 ${hue})`,
      accent:             `oklch(${L_dark + 0.02} 0.03 ${hue})`,
      border:             `oklch(${L_dark + 0.04} 0.025 ${hue})`,
      input:              `oklch(${L_dark + 0.04} 0.025 ${hue})`,
    },
  };
}

/* ── Presets ──────────────────────────────────────────── */

export const THEME_PRESETS: Record<string, ThemeDefinition> = {
  slate: {
    label: "Slate Blue",
    light: {
      background:          "oklch(0.98 0.006 260)",
      card:                "oklch(1 0 0)",
      cardForeground:      "oklch(0.22 0.025 15)",
      ...surface(260, 0.94, 0.26).light,
      secondaryForeground: "oklch(0.30 0.03 260)",
      mutedForeground:     "oklch(0.48 0.025 260)",
      accentForeground:    "oklch(0.25 0.03 260)",
      primary:             "oklch(0.40 0.06 260)",
      primaryForeground:   "oklch(0.97 0.005 260)",
      ring:                "oklch(0.40 0.06 260)",
    },
    dark: {
      background:          "oklch(0.16 0.02 260)",
      card:                "oklch(0.20 0.022 260)",
      cardForeground:      "oklch(0.93 0.012 30)",
      ...surface(260, 0.94, 0.26).dark,
      secondaryForeground: "oklch(0.88 0.012 260)",
      mutedForeground:     "oklch(0.62 0.02 260)",
      accentForeground:    "oklch(0.90 0.012 260)",
      primary:             "oklch(0.60 0.06 260)",
      primaryForeground:   "oklch(0.14 0.02 260)",
      ring:                "oklch(0.60 0.06 260)",
    },
  },

  rose: {
    label: "Dusty Rose",
    light: {
      background:          "oklch(0.985 0.008 30)",
      card:                "oklch(1 0 0)",
      cardForeground:      "oklch(0.22 0.025 15)",
      ...surface(20, 0.95, 0.26).light,
      secondaryForeground: "oklch(0.30 0.03 15)",
      mutedForeground:     "oklch(0.48 0.025 15)",
      accentForeground:    "oklch(0.25 0.03 15)",
      primary:             "oklch(0.52 0.085 12)",
      primaryForeground:   "oklch(0.99 0.005 30)",
      ring:                "oklch(0.52 0.085 12)",
    },
    dark: {
      background:          "oklch(0.16 0.02 15)",
      card:                "oklch(0.20 0.022 15)",
      cardForeground:      "oklch(0.93 0.012 30)",
      ...surface(20, 0.95, 0.26).dark,
      secondaryForeground: "oklch(0.88 0.012 30)",
      mutedForeground:     "oklch(0.62 0.02 20)",
      accentForeground:    "oklch(0.90 0.012 30)",
      primary:             "oklch(0.72 0.075 12)",
      primaryForeground:   "oklch(0.14 0.02 15)",
      ring:                "oklch(0.72 0.075 12)",
    },
  },

  sage: {
    label: "Sage",
    light: {
      background:          "oklch(0.975 0.008 140)",
      card:                "oklch(1 0 0)",
      cardForeground:      "oklch(0.22 0.025 15)",
      ...surface(140, 0.93, 0.26).light,
      secondaryForeground: "oklch(0.28 0.03 140)",
      mutedForeground:     "oklch(0.46 0.025 140)",
      accentForeground:    "oklch(0.24 0.03 140)",
      primary:             "oklch(0.45 0.07 140)",
      primaryForeground:   "oklch(0.97 0.005 140)",
      ring:                "oklch(0.45 0.07 140)",
    },
    dark: {
      background:          "oklch(0.16 0.02 140)",
      card:                "oklch(0.20 0.022 140)",
      cardForeground:      "oklch(0.93 0.012 30)",
      ...surface(140, 0.93, 0.26).dark,
      secondaryForeground: "oklch(0.88 0.012 140)",
      mutedForeground:     "oklch(0.62 0.02 140)",
      accentForeground:    "oklch(0.90 0.012 140)",
      primary:             "oklch(0.62 0.07 140)",
      primaryForeground:   "oklch(0.14 0.02 140)",
      ring:                "oklch(0.62 0.07 140)",
    },
  },

  teal: {
    label: "Teal",
    light: {
      background:          "oklch(0.975 0.008 190)",
      card:                "oklch(1 0 0)",
      cardForeground:      "oklch(0.22 0.025 15)",
      ...surface(190, 0.93, 0.26).light,
      secondaryForeground: "oklch(0.28 0.03 190)",
      mutedForeground:     "oklch(0.46 0.025 190)",
      accentForeground:    "oklch(0.24 0.03 190)",
      primary:             "oklch(0.42 0.07 190)",
      primaryForeground:   "oklch(0.97 0.005 190)",
      ring:                "oklch(0.42 0.07 190)",
    },
    dark: {
      background:          "oklch(0.16 0.02 190)",
      card:                "oklch(0.20 0.022 190)",
      cardForeground:      "oklch(0.93 0.012 30)",
      ...surface(190, 0.93, 0.26).dark,
      secondaryForeground: "oklch(0.88 0.012 190)",
      mutedForeground:     "oklch(0.62 0.02 190)",
      accentForeground:    "oklch(0.90 0.012 190)",
      primary:             "oklch(0.58 0.07 190)",
      primaryForeground:   "oklch(0.14 0.02 190)",
      ring:                "oklch(0.58 0.07 190)",
    },
  },

  ochre: {
    label: "Ochre",
    light: {
      background:          "oklch(0.98 0.008 70)",
      card:                "oklch(1 0 0)",
      cardForeground:      "oklch(0.22 0.025 15)",
      ...surface(70, 0.94, 0.26).light,
      secondaryForeground: "oklch(0.30 0.03 70)",
      mutedForeground:     "oklch(0.48 0.025 70)",
      accentForeground:    "oklch(0.25 0.03 70)",
      primary:             "oklch(0.45 0.075 70)",
      primaryForeground:   "oklch(0.97 0.005 70)",
      ring:                "oklch(0.45 0.075 70)",
    },
    dark: {
      background:          "oklch(0.16 0.02 70)",
      card:                "oklch(0.20 0.022 70)",
      cardForeground:      "oklch(0.93 0.012 30)",
      ...surface(70, 0.94, 0.26).dark,
      secondaryForeground: "oklch(0.88 0.012 70)",
      mutedForeground:     "oklch(0.62 0.02 70)",
      accentForeground:    "oklch(0.90 0.012 70)",
      primary:             "oklch(0.62 0.075 70)",
      primaryForeground:   "oklch(0.14 0.02 70)",
      ring:                "oklch(0.62 0.075 70)",
    },
  },

  plum: {
    label: "Plum",
    light: {
      background:          "oklch(0.975 0.008 330)",
      card:                "oklch(1 0 0)",
      cardForeground:      "oklch(0.22 0.025 15)",
      ...surface(330, 0.93, 0.26).light,
      secondaryForeground: "oklch(0.28 0.03 330)",
      mutedForeground:     "oklch(0.46 0.025 330)",
      accentForeground:    "oklch(0.24 0.03 330)",
      primary:             "oklch(0.40 0.07 330)",
      primaryForeground:   "oklch(0.97 0.005 330)",
      ring:                "oklch(0.40 0.07 330)",
    },
    dark: {
      background:          "oklch(0.16 0.02 330)",
      card:                "oklch(0.20 0.022 330)",
      cardForeground:      "oklch(0.93 0.012 30)",
      ...surface(330, 0.93, 0.26).dark,
      secondaryForeground: "oklch(0.88 0.012 330)",
      mutedForeground:     "oklch(0.62 0.02 330)",
      accentForeground:    "oklch(0.90 0.012 330)",
      primary:             "oklch(0.58 0.07 330)",
      primaryForeground:   "oklch(0.14 0.02 330)",
      ring:                "oklch(0.58 0.07 330)",
    },
  },
};

export type ThemeKey = keyof typeof THEME_PRESETS;

/* ─── Detect current theme ────────────────────────────── */

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/* ─── Apply theme to DOM ───────────────────────────────── */

const THEME_PROPS: Array<keyof ThemeColors> = [
  "background", "card", "cardForeground",
  "secondary", "secondaryForeground",
  "muted", "mutedForeground",
  "accent", "accentForeground",
  "border", "input",
  "primary", "primaryForeground", "ring",
];

function applyThemeToDOM(key: ThemeKey): void {
  const preset = THEME_PRESETS[key];
  if (!preset) return;
  const root = document.documentElement;
  const colors = isDark() ? preset.dark : preset.light;

  for (const prop of THEME_PROPS) {
    const cssName = prop === "cardForeground"
      ? "--color-card-foreground"
      : prop === "secondaryForeground"
        ? "--color-secondary-foreground"
        : prop === "mutedForeground"
          ? "--color-muted-foreground"
          : prop === "accentForeground"
            ? "--color-accent-foreground"
            : prop === "primaryForeground"
              ? "--color-primary-foreground"
              : `--color-${prop}`;
    root.style.setProperty(cssName, colors[prop]);
  }
}

function clearTheme(): void {
  const root = document.documentElement;
  const allProps = [
    "--color-background", "--color-card", "--color-card-foreground",
    "--color-secondary", "--color-secondary-foreground",
    "--color-muted", "--color-muted-foreground",
    "--color-accent", "--color-accent-foreground",
    "--color-border", "--color-input",
    "--color-primary", "--color-primary-foreground", "--color-ring",
  ];
  allProps.forEach((p) => root.style.removeProperty(p));
}

/* ─── Hook ────────────────────────────────────────────── */

export function useAccent() {
  const user = useAuthStore((s) => s.user);
  const [themeKey, setThemeKey] = useState<ThemeKey>("slate");
  const observerRef = useRef<MutationObserver | null>(null);

  // Load theme from user preferences
  useEffect(() => {
    const saved = user?.preferences?.accent_color;
    if (saved && saved in THEME_PRESETS) {
      setThemeKey(saved as ThemeKey);
    } else {
      setThemeKey("slate");
    }
  }, [user]);

  // Apply theme whenever the key or theme class changes
  useEffect(() => {
    const apply = () => {
      if (themeKey in THEME_PRESETS) {
        applyThemeToDOM(themeKey);
      } else {
        clearTheme();
      }
    };

    apply();

    observerRef.current = new MutationObserver(() => apply());
    observerRef.current.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observerRef.current?.disconnect();
  }, [themeKey]);

  // Save theme to backend and apply immediately
  const setAccent = useCallback(async (key: ThemeKey) => {
    if (!(key in THEME_PRESETS)) return;
    setThemeKey(key);
    try {
      await apiFetch(ENDPOINTS.preferences, {
        method: "PUT",
        body: JSON.stringify({ preferences: { accent_color: key } }),
      });
    } catch { /* next /me fetch will reconcile */ }
  }, []);

  return { themeKey, setAccent, presets: THEME_PRESETS };
}
