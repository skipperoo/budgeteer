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
import { encryptTransactionPayload, decryptTransactionPayload, transactionMonthEnd, currentMonthEnd } from "@/lib/crypto-transaction";
import { decryptECIESPayload } from "@/lib/crypto-rules";
import { getAccountKey } from "@/lib/decrypt-transactions";
import { encryptAccountMetadata } from "@/lib/account-metadata";
import { buildCheckpointsFromTxs, fetchAndDecryptAllTransactions as fetchAndDecryptAll } from "@/lib/checkpoint-recompute";
import { useCheckpointStore } from "./checkpoint-store";
import type { CheckpointBlob, Transaction } from "@/types";

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
  build_checkpoints_and_move_opening_balance: migrateBuildCheckpointsAndMoveOpeningBalance,
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
  // Ensure categories are loaded — re-read state after fetch (getState() is stale)
  if (!useCategoryStore.getState().loaded) {
    await useCategoryStore.getState().fetchCategories();
  }
  const categories = useCategoryStore.getState().items;

  // Build a reverse-lookup map: lowercase name → id
  const nameToId: Record<string, string> = {};
  for (const cat of categories) {
    nameToId[cat.name.toLowerCase()] = cat.id;
  }

  // Get all accounts — re-read state after fetch to avoid stale snapshot
  if (useAccountStore.getState().accounts.length === 0) {
    await useAccountStore.getState().fetchAccounts();
  }
  const accounts = useAccountStore.getState().accounts;
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

    // Fetch ALL transactions for this account via pagination (backend default limit is 50, max 200)
    let offset = 0;
    const PAGE_SIZE = 200;
    let allTxs: Transaction[] = [];
    while (true) {
      const page = await apiFetch<Transaction[]>(`${ENDPOINTS.transactions(acc.id)}?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!page || page.length === 0) break;
      allTxs = allTxs.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (allTxs.length === 0) continue;

    // Collect updated transactions in a batch, then send via bulk endpoint
    const batch: Array<{ id: string; time: string; encrypted_payload: string }> = [];

    for (const tx of allTxs) {
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
          delete payload.category;
        } else {
          const catName = (payload.category || "").toLowerCase().trim();
          const catId = nameToId[catName];
          if (!catId) continue;
          payload.category_id = catId;
          delete payload.category;
        }

        const reEncrypted = await encryptTransactionPayload(payload, accountKey);
        batch.push({ id: tx.id, time: tx.time, encrypted_payload: reEncrypted });
        totalUpdated++;
      } catch {
        // Skip transactions we can't decrypt
      }
    }

    // Send in chunks of 200 via the bulk endpoint
    const BULK_LIMIT = 200;
    for (let i = 0; i < batch.length; i += BULK_LIMIT) {
      const chunk = batch.slice(i, i + BULK_LIMIT);
      await apiFetch(ENDPOINTS.bulkUpdateTransactions, {
        method: "PUT",
        body: JSON.stringify({ transactions: chunk }),
      });
    }
  }
}

// ─── Migration: build_checkpoints_and_move_opening_balance ────────────────
//
// Moves the legacy "Opening Balance" transaction out of the transactions
// table into accounts.encrypted_metadata, and builds contiguous monthly
// balance checkpoints for every account the user can access.
//
// See /spec.md (perf/checkpointing) §6.
async function migrateBuildCheckpointsAndMoveOpeningBalance(_userId: string): Promise<void> {
  if (useAccountStore.getState().accounts.length === 0) {
    await useAccountStore.getState().fetchAccounts();
  }
  const accounts = useAccountStore.getState().accounts;
  if (accounts.length === 0) return;

  const authStore = useAuthStore.getState();
  const privKey = authStore.plaintextPrivateKey;
  const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
  const userPubKey = authStore.user?.public_key;

  for (const acc of accounts) {
    let accountKey: string;
    try {
      accountKey = await getAccountKey(acc.id, privKeyBase64 ?? undefined, userPubKey);
    } catch {
      continue; // skip accounts we can't decrypt
    }

    // 1. Download ALL transactions (paginated) and decrypt.
    // `fetchAndDecryptAll` adds a decrypted `payload` field to each tx.
    const allRaw = (await fetchAndDecryptAll(acc.id, accountKey)) as unknown as Array<Transaction & { payload: any }>;
    const hasMeta = !!(acc.encrypted_metadata);
    if (allRaw.length === 0 && !hasMeta) {
      // Nothing to do for an empty, unmigrated account.
      continue;
    }

    // 2. Separate legacy Opening Balance transactions from the rest.
    const obTxs = allRaw.filter((t) => t.payload?.category === "Opening Balance");
    const realTxs = allRaw.filter((t) => !(t.payload?.category === "Opening Balance"));

    // 3. Compute opening_balance_cents from the OB transactions (signed sum).
    let openingBalance = 0;
    for (const t of obTxs) {
      if (t.payload) openingBalance += t.payload.amount;
    }
    const openingBalanceCents = Math.round(openingBalance * 100);

    // 4. Soft-delete each Opening Balance transaction.
    for (const t of obTxs) {
      await apiFetch(ENDPOINTS.transaction(t.id), { method: "DELETE" });
    }

    // 5. Write encrypted_metadata on the account (idempotent: only if the
    //    account doesn't already have metadata, or its value would change).
    const metaBlob = { opening_balance_cents: openingBalanceCents };
    const encMeta = await encryptAccountMetadata(metaBlob, accountKey);
    await apiFetch(ENDPOINTS.account(acc.id), {
      method: "PUT",
      body: JSON.stringify({
        name: acc.name,
        currency: acc.currency,
        type: acc.type,
        encrypted_metadata: encMeta,
      }),
    });

    // 6. Build contiguous monthly checkpoints from the first real tx month
    //    through the current month (empty months included).
    let fromMonthEnd = currentMonthEnd();
    for (const t of realTxs) {
      const me = transactionMonthEnd(t.time);
      if (me < fromMonthEnd) fromMonthEnd = me;
    }
    const toMonthEnd = currentMonthEnd();

    const computed = buildCheckpointsFromTxs(
      realTxs.map((t) => ({ time: t.time, payload: t.payload })),
      openingBalance, // float base
      fromMonthEnd,
      toMonthEnd,
      0,
    );

    // 7. Bulk-PUT (and cache) the checkpoints via the checkpoint store.
    await useCheckpointStore.getState().upsertMany(acc.id, computed, accountKey);
  }
}
