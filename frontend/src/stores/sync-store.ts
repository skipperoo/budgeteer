import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import type { SyncQueueItem, SyncOperation, SyncPullResponse } from "@/types";

interface SyncState {
  items: SyncQueueItem[];
  loading: boolean;
  error: string | null;
  pull: (since?: string) => Promise<SyncPullResponse>;
  push: (operations: SyncOperation[]) => Promise<void>;
  clear: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  items: [],
  loading: false,
  error: null,

  pull: async (since) => {
    set({ loading: true, error: null });
    try {
      const url = since
        ? `${ENDPOINTS.syncPull}?since=${encodeURIComponent(since)}`
        : ENDPOINTS.syncPull;
      const res = await apiFetch<SyncPullResponse>(url);
      set((s) => ({ items: [...s.items, ...res.items], loading: false }));
      return res;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  push: async (operations) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(ENDPOINTS.syncPush, {
        method: "POST",
        body: JSON.stringify({ operations }),
      });
      set({ loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  clear: () => set({ items: [], error: null }),
}));
