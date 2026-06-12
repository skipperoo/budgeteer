/**
 * useAccent — manages the user's preferred accent color.
 *
 * Persisted to the backend via `PUT /api/v1/auth/preferences`.
 * Applied to the DOM by setting CSS custom properties on <html>,
 * respecting the current light/dark theme. Listens for theme class
 * changes on <html> so the accent tracks the toggle correctly.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

/* ─── Accent presets ──────────────────────────────────── */

export interface AccentDefinition {
  label: string;
  light: { primary: string; primaryFg: string };
  dark:  { primary: string; primaryFg: string };
}

export const ACCENT_PRESETS: Record<string, AccentDefinition> = {
  slate: {
    label: "Slate Blue",
    light: { primary: "oklch(0.40 0.06 260)", primaryFg: "oklch(0.97 0.005 260)" },
    dark:  { primary: "oklch(0.60 0.06 260)", primaryFg: "oklch(0.14 0.02 260)" },
  },
  rose: {
    label: "Dusty Rose",
    light: { primary: "oklch(0.52 0.085 12)", primaryFg: "oklch(0.99 0.005 30)" },
    dark:  { primary: "oklch(0.72 0.075 12)", primaryFg: "oklch(0.14 0.02 15)" },
  },
  sage: {
    label: "Sage",
    light: { primary: "oklch(0.45 0.07 140)", primaryFg: "oklch(0.97 0.005 140)" },
    dark:  { primary: "oklch(0.62 0.07 140)", primaryFg: "oklch(0.14 0.02 140)" },
  },
  teal: {
    label: "Teal",
    light: { primary: "oklch(0.42 0.07 190)", primaryFg: "oklch(0.97 0.005 190)" },
    dark:  { primary: "oklch(0.58 0.07 190)", primaryFg: "oklch(0.14 0.02 190)" },
  },
  ochre: {
    label: "Ochre",
    light: { primary: "oklch(0.45 0.075 70)", primaryFg: "oklch(0.97 0.005 70)" },
    dark:  { primary: "oklch(0.62 0.075 70)", primaryFg: "oklch(0.14 0.02 70)" },
  },
  plum: {
    label: "Plum",
    light: { primary: "oklch(0.40 0.07 330)", primaryFg: "oklch(0.97 0.005 330)" },
    dark:  { primary: "oklch(0.58 0.07 330)", primaryFg: "oklch(0.14 0.02 330)" },
  },
};

export type AccentKey = keyof typeof ACCENT_PRESETS;

/* ─── Detect current theme ────────────────────────────── */

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/* ─── Apply accent to DOM ─────────────────────────────── */

function applyAccent(key: AccentKey): void {
  const accent = ACCENT_PRESETS[key];
  if (!accent) return;
  const root = document.documentElement;
  const theme = isDark() ? "dark" : "light";
  const colors = accent[theme];

  root.style.setProperty("--color-primary", colors.primary);
  root.style.setProperty("--color-primary-foreground", colors.primaryFg);
  root.style.setProperty("--color-ring", colors.primary);
}

function clearAccent(): void {
  const root = document.documentElement;
  ["--color-primary", "--color-primary-foreground", "--color-ring"].forEach((p) =>
    root.style.removeProperty(p)
  );
}

/* ─── Hook ────────────────────────────────────────────── */

export function useAccent() {
  const user = useAuthStore((s) => s.user);
  const [accentKey, setAccentKey] = useState<AccentKey>("slate");
  const observerRef = useRef<MutationObserver | null>(null);

  // Load accent from user preferences
  useEffect(() => {
    const saved = user?.preferences?.accent_color;
    if (saved && saved in ACCENT_PRESETS) {
      setAccentKey(saved as AccentKey);
    } else {
      setAccentKey("slate");
    }
  }, [user]);

  // Apply accent whenever the key or theme class changes
  useEffect(() => {
    const apply = () => {
      if (accentKey in ACCENT_PRESETS) {
        applyAccent(accentKey);
      } else {
        clearAccent();
      }
    };

    apply();

    // Watch for theme class changes on <html>
    observerRef.current = new MutationObserver(() => {
      apply();
    });
    observerRef.current.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [accentKey]);

  // Save accent to backend and apply immediately
  const setAccent = useCallback(async (key: AccentKey) => {
    if (!(key in ACCENT_PRESETS)) return;
    setAccentKey(key);
    try {
      await apiFetch(ENDPOINTS.preferences, {
        method: "PUT",
        body: JSON.stringify({ preferences: { accent_color: key } }),
      });
    } catch {
      // silently ignore — next /me fetch will reconcile
    }
  }, []);

  return { accentKey, setAccent, presets: ACCENT_PRESETS };
}
