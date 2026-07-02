/**
 * Category Store
 *
 * Categories are stored on the backend under the user's profile.
 * The store keeps an in-memory cache and syncs with the backend via API calls.
 *
 * On first access, categories are lazily fetched from the server.
 * Mutations (add/remove) optimistically update the local cache and fire
 * the corresponding API call. If the API call fails, the change is reverted.
 */

import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import type { UserCategory } from "@/types";

export type CategoryType = "income" | "expense";

interface CategoryState {
  /** Version counter bumped on every mutation — drives reactive re-renders */
  version: number;
  /** In-memory cache of all user categories */
  items: UserCategory[];
  /** True after the first successful fetch from the backend */
  loaded: boolean;
  /** True while a fetch is in-flight */
  loading: boolean;

  /** Get category names for a given transaction type */
  getCategories: (type: CategoryType) => string[];
  /** Add a new category under the given transaction type */
  addCategory: (type: CategoryType, category: string) => Promise<void>;
  /** Remove a category under the given transaction type */
  removeCategory: (type: CategoryType, category: string) => Promise<void>;
  /** Fetch categories from the backend (called automatically on first access) */
  fetchCategories: () => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  version: 0,
  items: [],
  loaded: false,
  loading: false,

  getCategories: (type) => {
    // Trigger lazy load if not loaded yet
    if (!get().loaded && !get().loading) {
      // Fire and forget — the fetch will bump version when done,
      // which causes a re-render with the populated list
      get().fetchCategories();
    }
    return get().items
      .filter((c) => c.type === type)
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b));
  },

  fetchCategories: async () => {
    set({ loading: true });
    try {
      const data = await apiFetch<UserCategory[]>(ENDPOINTS.categories);
      set({ items: data ?? [], loaded: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addCategory: async (type, category) => {
    const normalized = category.trim();
    if (!normalized) return;

    // Don't add duplicates
    if (get().items.some((c) => c.type === type && c.name === normalized)) return;

    // Optimistic add with a temp ID (the real ID comes from the server)
    const tempId = `temp_${Date.now()}`;
    const prev = get().items;
    set({
      items: [...prev, { id: tempId, user_id: "", name: normalized, type, created_at: "" }],
      version: get().version + 1,
    });

    try {
      const created = await apiFetch<UserCategory>(ENDPOINTS.categories, {
        method: "POST",
        body: JSON.stringify({ name: normalized, type }),
      });
      // Replace the temp entry with the server response
      set({
        items: get().items.map((c) =>
          c.id === tempId
            ? { id: created.id, user_id: created.user_id, name: created.name, type: created.type, created_at: created.created_at }
            : c
        ),
      });
    } catch {
      // Revert optimistic add
      set({ items: prev, version: get().version + 1 });
    }
  },

  removeCategory: async (type, category) => {
    const target = get().items.find((c) => c.type === type && c.name === category);
    if (!target) return;

    // Optimistic remove
    const prev = get().items;
    set({
      items: prev.filter((c) => c.id !== target.id),
      version: get().version + 1,
    });

    try {
      await apiFetch(ENDPOINTS.category(target.id), { method: "DELETE" });
    } catch {
      // Revert
      set({ items: prev, version: get().version + 1 });
    }
  },
}));
