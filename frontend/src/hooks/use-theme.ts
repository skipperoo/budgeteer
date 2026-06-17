import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import type { UserPreferences } from "@/types";

type Theme = "light" | "dark";

const STORAGE_KEY = "budgeteer_theme";

function getInitialTheme(): Theme {
  // Check localStorage first
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* ignore */ }
  // Fall back to system preference
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Apply on mount
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const saveThemeToBackend = useCallback(async (t: Theme) => {
    try {
      const { user } = useAuthStore.getState();
      const currentPrefs = user?.preferences ?? { accent_color: "slate" };
      await apiFetch(ENDPOINTS.preferences, {
        method: "PUT",
        body: JSON.stringify({
          preferences: { ...currentPrefs, theme: t } as UserPreferences,
        }),
      });
    } catch { /* silently fail */ }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch { /* ignore */ }
    saveThemeToBackend(t);
  }, [saveThemeToBackend]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
