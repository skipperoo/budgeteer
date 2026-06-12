/**
 * Category Store
 *
 * Categories are stored globally in localStorage (not per-account), split by
 * transaction type ("income" | "expense"). This means the same category list
 * is available across all accounts.
 *
 * Persistence key: "budgeteer_categories"
 * Storage shape:   { income: string[], expense: string[] }
 *
 * Legacy migration: if the stored value is a plain string[] (old per-account
 * flat format), it is silently promoted to { income: [], expense: [...old] }.
 */

import { create } from "zustand";

export type CategoryType = "income" | "expense";

const STORAGE_KEY = "budgeteer_categories";

interface AllCategories {
  income: string[];
  expense: string[];
}

function loadAll(): AllCategories {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { income: [], expense: [] };
    const parsed = JSON.parse(raw);
    // Legacy migration: old format was a flat string[]
    if (Array.isArray(parsed)) {
      return { income: [], expense: parsed as string[] };
    }
    return {
      income: Array.isArray(parsed.income) ? parsed.income : [],
      expense: Array.isArray(parsed.expense) ? parsed.expense : [],
    };
  } catch {
    return { income: [], expense: [] };
  }
}

function saveAll(data: AllCategories): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

interface CategoryState {
  /** Version counter bumped on every mutation — drives reactive re-renders */
  version: number;
  /** Get categories for a given transaction type */
  getCategories: (type: CategoryType) => string[];
  /** Add a new category under the given transaction type */
  addCategory: (type: CategoryType, category: string) => void;
  /** Remove a category under the given transaction type */
  removeCategory: (type: CategoryType, category: string) => void;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  version: 0,

  getCategories: (type) => loadAll()[type],

  addCategory: (type, category) => {
    const all = loadAll();
    const normalized = category.trim();
    if (!normalized || all[type].includes(normalized)) return;
    all[type] = [...all[type], normalized];
    saveAll(all);
    set({ version: get().version + 1 });
  },

  removeCategory: (type, category) => {
    const all = loadAll();
    all[type] = all[type].filter((c) => c !== category);
    saveAll(all);
    set({ version: get().version + 1 });
  },
}));
