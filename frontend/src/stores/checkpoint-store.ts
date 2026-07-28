/**
 * Checkpoint Store
 *
 * Holds decrypted + raw monthly balance checkpoints per account, and exposes
 * actions to load them, upsert them (bulk PUT), and query the running balance
 * through a given month.
 *
 * Each checkpoint is stored BOTH in its encrypted form (for pushes) and in its
 * decrypted form (for local computation). The decrypted balance is a float
 * (see spec §9 Q2 resolution: float, 2-dp).
 *
 * See /spec.md (perf/checkpointing) §4.1, §4.3, §4.5, §5.
 */

import { create } from "zustand";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import {
  decryptCheckpointBlob,
  encryptCheckpointBlob,
} from "@/lib/crypto-transaction";
import { getAccountKey } from "@/lib/decrypt-transactions";
import { useAuthStore } from "./auth-store";
import { bytesToBase64 } from "@/lib/crypto";
import type { Checkpoint, CheckpointBlob } from "@/types";

/** A checkpoint held in memory: raw row + decrypted blob (null if undecryptable). */
export interface CheckpointEntry {
  account_id: string;
  checkpoint_month: string;
  encrypted_balance: string;
  blob: CheckpointBlob | null;
  /** Server updated_at (RFC), used as the LWW tiebreaker on sync receive. */
  updated_at: string;
}

interface CheckpointState {
  /** account_id -> entries, sorted ascending by checkpoint_month. */
  byAccount: Record<string, CheckpointEntry[]>;
  loading: boolean;
  error: string | null;

  loadCheckpoints: (accountId: string, from?: string, to?: string) => Promise<void>;
  upsertMany: (
    accountId: string,
    rows: Array<{ checkpoint_month: string; blob: CheckpointBlob }>,
    accountKey: string,
  ) => Promise<void>;
  /** Balance of an account through the end of `monthEnd` (inclusive). */
  balanceThrough: (accountId: string, monthEnd: string) => number | null;
  /** Return raw entries for an account (ascending). */
  getEntries: (accountId: string) => CheckpointEntry[];
  /** Apply a remotely-received checkpoint (LWW by updated_at). */
  applyRemote: (accountId: string, entry: CheckpointEntry) => void;
  /** Drop all entries for an account (e.g. after account deletion). */
  clearAccount: (accountId: string) => void;
}

export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  byAccount: {},
  loading: false,
  error: null,

  loadCheckpoints: async (accountId, from, to) => {
    let qs = "";
    if (from) qs += `from=${encodeURIComponent(from)}&`;
    if (to) qs += `to=${encodeURIComponent(to)}&`;
    const url = `${ENDPOINTS.checkpoints(accountId)}${qs ? `?${qs}` : ""}`;
    const resp = await apiFetch<{ checkpoints: Checkpoint[] }>(url);
    const rows = resp?.checkpoints ?? [];

    // Decrypt with the account key.
    const privKey = useAuthStore.getState().plaintextPrivateKey;
    const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
    const userPubKey = useAuthStore.getState().user?.public_key;
    let accountKey = "";
    try {
      accountKey = await getAccountKey(accountId, privKeyBase64 ?? undefined, userPubKey);
    } catch {
      // Can't decrypt without the key; store raw rows with null blobs.
      accountKey = "";
    }

    const entries: CheckpointEntry[] = [];
    for (const row of rows) {
      let blob: CheckpointBlob | null = null;
      if (accountKey) blob = await decryptCheckpointBlob(row.encrypted_balance, accountKey);
      entries.push({
        account_id: row.account_id,
        checkpoint_month: row.checkpoint_month,
        encrypted_balance: row.encrypted_balance,
        blob,
        updated_at: row.updated_at,
      });
    }
    entries.sort((a, b) => (a.checkpoint_month < b.checkpoint_month ? -1 : 1));

    set((s) => ({
      byAccount: { ...s.byAccount, [accountId]: entries },
    }));
  },

  upsertMany: async (accountId, rows, accountKey) => {
    // Encrypt each blob and send the bulk PUT.
    const payload: Array<{ checkpoint_month: string; encrypted_balance: string }> = [];
    for (const r of rows) {
      const enc = await encryptCheckpointBlob(r.blob, accountKey);
      payload.push({ checkpoint_month: r.checkpoint_month, encrypted_balance: enc });
    }
    await apiFetch(ENDPOINTS.checkpoints(accountId), {
      method: "PUT",
      body: JSON.stringify({ checkpoints: payload }),
    });
    // Update local cache optimistically.
    set((s) => {
      const existing = s.byAccount[accountId] ?? [];
      const map = new Map(existing.map((e) => [e.checkpoint_month, e]));
      const now = new Date().toISOString();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const enc = payload[i].encrypted_balance;
        const prev = map.get(r.checkpoint_month);
        map.set(r.checkpoint_month, {
          account_id: accountId,
          checkpoint_month: r.checkpoint_month,
          encrypted_balance: enc,
          blob: r.blob,
          updated_at: now, // optimistic; will be reconciled on next load
        });
      }
      const merged = Array.from(map.values()).sort((a, b) =>
        a.checkpoint_month < b.checkpoint_month ? -1 : 1,
      );
      return { byAccount: { ...s.byAccount, [accountId]: merged } };
    });
  },

  balanceThrough: (accountId, monthEnd) => {
    const entries = get().byAccount[accountId] ?? [];
    if (entries.length === 0) return null;
    // Find the latest checkpoint whose month <= monthEnd.
    let best: CheckpointEntry | null = null;
    for (const e of entries) {
      if (e.checkpoint_month <= monthEnd && (!best || e.checkpoint_month > best.checkpoint_month)) {
        best = e;
      }
    }
    return best?.blob?.balance ?? null;
  },

  getEntries: (accountId) => get().byAccount[accountId] ?? [],

  applyRemote: (accountId, entry) =>
    set((s) => {
      const existing = s.byAccount[accountId] ?? [];
      const idx = existing.findIndex((e) => e.checkpoint_month === entry.checkpoint_month);
      if (idx === -1) {
        const merged = [...existing, entry].sort((a, b) =>
          a.checkpoint_month < b.checkpoint_month ? -1 : 1,
        );
        return { byAccount: { ...s.byAccount, [accountId]: merged } };
      }
      // LWW by updated_at.
      if (entry.updated_at > existing[idx].updated_at) {
        const merged = existing.slice();
        merged[idx] = entry;
        return { byAccount: { ...s.byAccount, [accountId]: merged } };
      }
      return {};
    }),

  clearAccount: (accountId) =>
    set((s) => {
      const next = { ...s.byAccount };
      delete next[accountId];
      return { byAccount: next };
    }),
}));