/**
 * FilterStore — shared state for category and transaction type filters
 * applied on top of the date range in DashboardPage and AccountDetailPage.
 *
 * Default (empty arrays) means "show all". When a user selects specific
 * categories or types, only matching transactions are displayed.
 */

import { create } from "zustand";

export type TransactionTypeFilter = "income" | "expense" | "transfer";

interface FilterState {
  /** Category names to include. Empty = show all. */
  selectedCategories: string[];
  /** Transaction types to include. Empty = show all. */
  selectedTypes: TransactionTypeFilter[];
  /** Set the exact list of selected categories. */
  setSelectedCategories: (categories: string[]) => void;
  /** Set the exact list of selected transaction types. */
  setSelectedTypes: (types: TransactionTypeFilter[]) => void;
  /** Toggle a single category on/off. */
  toggleCategory: (category: string) => void;
  /** Toggle a single type on/off. */
  toggleType: (type: TransactionTypeFilter) => void;
  /** Reset all filters (categories and types) to empty (show all). */
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  selectedCategories: [],
  selectedTypes: [],

  setSelectedCategories: (categories) => set({ selectedCategories: categories }),
  setSelectedTypes: (types) => set({ selectedTypes: types }),

  toggleCategory: (category) => {
    const current = get().selectedCategories;
    if (current.includes(category)) {
      set({ selectedCategories: current.filter((c) => c !== category) });
    } else {
      set({ selectedCategories: [...current, category] });
    }
  },

  toggleType: (type) => {
    const current = get().selectedTypes;
    if (current.includes(type)) {
      set({ selectedTypes: current.filter((t) => t !== type) });
    } else {
      set({ selectedTypes: [...current, type] });
    }
  },

  resetFilters: () => set({ selectedCategories: [], selectedTypes: [] }),
}));
