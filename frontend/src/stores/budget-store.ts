import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import type { Budget, CreateBudgetRequest, UpdateBudgetRequest } from "@/types";

interface BudgetStore {
  budgets: Budget[];
  loading: boolean;
  error: string | null;

  fetchBudgets: () => Promise<void>;
  createBudget: (req: CreateBudgetRequest) => Promise<Budget>;
  updateBudget: (id: string, req: UpdateBudgetRequest) => Promise<Budget>;
  deleteBudget: (id: string) => Promise<void>;
  notifyThreshold: (id: string, threshold: 50 | 80 | 100) => Promise<void>;
}

export const useBudgetStore = create<BudgetStore>((set, get) => ({
  budgets: [],
  loading: false,
  error: null,

  fetchBudgets: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<Budget[]>(ENDPOINTS.budgets);
      set({ budgets: data, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch budgets";
      set({ error: msg, loading: false });
    }
  },

  createBudget: async (req) => {
    const data = await apiFetch<Budget>(ENDPOINTS.budgets, {
      method: "POST",
      body: JSON.stringify(req),
    });
    set((s) => ({ budgets: [data, ...s.budgets] }));
    return data;
  },

  updateBudget: async (id, req) => {
    const data = await apiFetch<Budget>(ENDPOINTS.budget(id), {
      method: "PUT",
      body: JSON.stringify(req),
    });
    set((s) => ({
      budgets: s.budgets.map((b) => (b.id === id ? data : b)),
    }));
    return data;
  },

  deleteBudget: async (id) => {
    await apiFetch<void>(ENDPOINTS.budget(id), { method: "DELETE" });
    set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) }));
  },

  notifyThreshold: async (id, threshold) => {
    await apiFetch<void>(ENDPOINTS.budgetNotify(id), {
      method: "POST",
      body: JSON.stringify({ threshold }),
    });
  },
}));
