import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { useCheckpointStore } from "./checkpoint-store";
import { useAccountStore } from "./account-store";
import type { SyncQueueItem, SyncOperation, SyncPullResponse } from "@/types";
import type { CheckpointEntry } from "./checkpoint-store";

interface SyncState {
  items: SyncQueueItem[];
  loading: boolean;
  error: string | null;
  pull: (since?: string) => Promise<SyncPullResponse>;
  push: (operations: SyncOperation[]) => Promise<void>;
  clear: () => void;
}

/**
 * Process incoming sync queue items, applying checkpoint / account_metadata
 * updates to the local stores (LWW by source_updated_at on checkpoints).
 * Transaction items are NOT applied here — they're re-fetched by the
 * dashboard/account-detail via the regular transaction list endpoints.
 */
function applySyncedItems(items: SyncQueueItem[]): void {
  for (const item of items) {
    if (item.entity_type === "checkpoint" && item.checkpoint_month && item.encrypted_payload && item.account_id && item.source_updated_at) {
      const entry: CheckpointEntry = {
        account_id: item.account_id,
        checkpoint_month: item.checkpoint_month,
        encrypted_balance: item.encrypted_payload,
        blob: null, // don't decrypt on the sync path; trigger loadCheckpoints
        updated_at: item.source_updated_at,
      };
      useCheckpointStore.getState().applyRemote(item.account_id, entry);
      // Schedule a re-load+decrypt so the local blob is populated.
      useCheckpointStore.getState().loadCheckpoints(item.account_id).catch(() => {});
    }
    if (item.entity_type === "account_metadata" && item.encrypted_payload && item.account_id) {
      // Update the local account's encrypted_metadata so subsequent opens
      // of the account-detail can decrypt the new opening balance.
      const accounts = useAccountStore.getState().accounts;
      const idx = accounts.findIndex((a) => a.id === item.account_id);
      if (idx !== -1) {
        const updated = { ...accounts[idx], encrypted_metadata: item.encrypted_payload };
        const newAccounts = accounts.slice();
        newAccounts[idx] = updated;
        useAccountStore.setState({ accounts: newAccounts });
      }
    }
  }
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
      // Process checkpoint/account_metadata updates for joint-account sync.
      if (res.items) applySyncedItems(res.items);
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
