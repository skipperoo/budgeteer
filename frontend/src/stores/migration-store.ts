/**
 * Migration Store
 *
 * Manages client-side data migrations. After login, queries the backend for
 * pending migrations, runs them sequentially, and marks them as complete.
 *
 * A migration is a frontend-side transformation of user data (e.g., adding
 * category_id to all existing transaction payloads). The backend only tracks
 * which migrations are pending/completed per user.
 *
 * Usage:
 *   After login/auth check, call:
 *     await useMigrationStore.getState().runPendingMigrations()
 *
 *   This runs in the background — the user can continue using the app.
 */

import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { toast } from "@/components/ui/toast";
import { useAccountStore } from "./account-store";
import { useCategoryStore } from "./category-store";
import { useAuthStore } from "./auth-store";
import { bytesToBase64 } from "@/lib/crypto";
import { encryptTransactionPayload, decryptTransactionPayload } from "@/lib/crypto-transaction";
import { decryptECIESPayload } from "@/lib/crypto-rules";
import { getAccountKey } from "@/lib/decrypt-transactions";
import type { Transaction, CreateTransactionRequest } from "@/types";

export type MigrationStatus = "idle" | "running" | "done";

interface MigrationState {
  status: MigrationStatus;
  currentMigration: string | null;
  progress: string;
  error: string | null;

  /** Check for pending migrations and run them. Safe to call repeatedly. */
  runPendingMigrations: () => Promise<void>;
}

/** Known migration keys and their runner functions. */
const MIGRATIONS: Record<string, (userId: string) => Promise<void>> = {
  add_category_id: migrateAddCategoryId,
};

export const useMigrationStore = create<MigrationState>((set, get) => ({
  status: "idle",
  currentMigration: null,
  progress: "",
  error: null,

  runPendingMigrations: async () => {
    if (get().status === "running") return;

    // Guard: private key must be available to decrypt transaction payloads
    const privKey = useAuthStore.getState().plaintextPrivateKey;
    if (!privKey) {
      // Private key not yet decrypted (PrivateKeyGate not passed) — bail out.
      // The migration will be triggered again by setPrivateKey when the user
      // enters their password.
      return;
    }

    set({ status: "running", error: null });

    try {
      const resp = await apiFetch<{ migrations: Array<{ migration_key: string }> }>(
        ENDPOINTS.pendingMigrations
      );
      const pending = resp?.migrations ?? [];

      if (pending.length === 0) {
        set({ status: "done" });
        return;
      }

      for (const m of pending) {
        const runner = MIGRATIONS[m.migration_key];
        if (!runner) {
          continue;
        }

        set({ currentMigration: m.migration_key, progress: `Running ${m.migration_key}...` });
        toast({ title: `Migration: ${m.migration_key}`, description: "Starting…", variant: "info" });

        try {
          const userId = useAuthStore.getState().user?.id;
          if (!userId) throw new Error("User not authenticated");

          await runner(userId);

          await apiFetch(ENDPOINTS.completeMigration, {
            method: "POST",
            body: JSON.stringify({ migration_key: m.migration_key }),
          });

          toast({ title: `Migration: ${m.migration_key}`, description: "Completed successfully", variant: "success" });
        } catch (err: any) {
          toast({ title: `Migration: ${m.migration_key}`, description: `Failed: ${err.message}`, variant: "error" });
          try {
            await apiFetch(ENDPOINTS.failMigration, {
              method: "POST",
              body: JSON.stringify({
                migration_key: m.migration_key,
                error: err.message ?? "Unknown error",
              }),
            });
          } catch { /* ignore */ }
          set({ error: `Migration ${m.migration_key} failed: ${err.message}` });
        }
      }

      set({ status: "done", currentMigration: null, progress: "" });
    } catch (err: any) {
      set({ status: "idle", error: `Failed to check migrations: ${err.message}` });
    }
  },
}));

// ─── Migration Runners ────────────────────────────────────────────────────

/**
 * Migration: add_category_id
 *
 * Decrypts all existing transaction payloads and adds the `category_id` field
 * by looking up the category name in the user's category list. Transactions
 * whose category name doesn't match any user category are left unchanged
 * (they'll continue to work via name-based fallback).
 */
async function migrateAddCategoryId(_userId: string): Promise<void> {
  // Ensure categories are loaded
  const catStore = useCategoryStore.getState();
  if (!catStore.loaded) {
    await catStore.fetchCategories();
  }
  const categories = catStore.items;

  // Build a reverse-lookup map: lowercase name → id
  const nameToId: Record<string, string> = {};
  for (const cat of categories) {
    nameToId[cat.name.toLowerCase()] = cat.id;
  }

  // Get all accounts
  const accStore = useAccountStore.getState();
  if (accStore.accounts.length === 0) {
    await accStore.fetchAccounts();
  }
  const accounts = accStore.accounts;
  if (accounts.length === 0) return;

  const authStore = useAuthStore.getState();
  const privKey = authStore.plaintextPrivateKey;
  const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
  const userPubKey = authStore.user?.public_key;

  let totalUpdated = 0;

  for (const acc of accounts) {
    let accountKey: string;
    try {
      accountKey = await getAccountKey(acc.id, privKeyBase64 ?? undefined, userPubKey);
    } catch {
      continue; // skip accounts we can't access
    }

    const txs = await apiFetch<Transaction[]>(ENDPOINTS.transactions(acc.id));
    if (!txs || txs.length === 0) continue;

    for (const tx of txs) {
      try {
        let payload: any;

        if (tx.encrypted_payload.startsWith("1|")) {
          if (!privKeyBase64) continue;
          payload = await decryptECIESPayload<any>(tx.encrypted_payload, privKeyBase64);
        } else {
          payload = await decryptTransactionPayload(tx.encrypted_payload, accountKey);
        }

        // Skip transfers — they use "Transfer" as a label, not a real category
        if (payload.is_transfer && payload.transfer_pair_id) continue;
        // Skip opening balance — not a user-managed category
        if (payload.category === "Opening Balance") continue;

        // Skip if already fully migrated (category already removed)
        if (!payload.category && payload.category_id) continue;

        if (payload.category_id) {
          // Already has category_id from first migration run but still has
          // the old category name (e.g. because category was renamed since).
          // Just remove the name — the id is already correct.
          delete payload.category;
        } else {
          // First-time migration: look up the category id by name
          const catName = (payload.category || "").toLowerCase().trim();
          const catId = nameToId[catName];
          if (!catId) continue; // skip unmatched (will still work via name fallback)
          payload.category_id = catId;
          delete payload.category;
        }

        const reEncrypted = await encryptTransactionPayload(payload, accountKey);
        await apiFetch<Transaction>(ENDPOINTS.transaction(tx.id), {
          method: "PUT",
          body: JSON.stringify({
            time: tx.time,
            encrypted_payload: reEncrypted,
          } as CreateTransactionRequest),
        });

        totalUpdated++;
      } catch {
        // Skip transactions we can't decrypt
      }
    }
  }
}
