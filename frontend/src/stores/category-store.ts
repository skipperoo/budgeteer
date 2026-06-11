/**
 * Category Store
 *
 * Categories are stored per-account in localStorage. Each user has their own
 * category list per account. For joint accounts, categories are shared by
 * merging all members' categories (each member adds locally, the merge
 * happens on the client).
 *
 * Persistence key: "budgeteer_categories_{accountId}"
 */

import { create } from "zustand";

const STORAGE_PREFIX = "budgeteer_categories_";

function loadCategories(accountId: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + accountId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCategories(accountId: string, categories: string[]): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + accountId, JSON.stringify(categories));
  } catch { /* ignore quota errors */ }
}

interface CategoryState {
  /** Get categories for a specific account (from localStorage) */
  getCategories: (accountId: string) => string[];
  /** Add a new category for an account */
  addCategory: (accountId: string, category: string) => void;
  /** Remove a category for an account */
  removeCategory: (accountId: string, category: string) => void;
}

export const useCategoryStore = create<CategoryState>(() => ({
  getCategories: (accountId) => loadCategories(accountId),

  addCategory: (accountId, category) => {
    const existing = loadCategories(accountId);
    const normalized = category.trim();
    if (!normalized || existing.includes(normalized)) return;
    saveCategories(accountId, [...existing, normalized]);
  },

  removeCategory: (accountId, category) => {
    const existing = loadCategories(accountId);
    saveCategories(accountId, existing.filter((c) => c !== category));
  },
}));
