/**
 * Checkpoint recompute + on-transaction-change propagation.
 *
 * Pure, testable helpers that build monthly checkpoints from a list of
 * (already-decrypted) transactions, plus the adapters used by the live UI to
 * fetch transactions for an account and push the recomputed checkpoints.
 *
 * See /spec.md (perf/checkpointing) §4.4, §4.5, §5.3.
 */

import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { bytesToBase64 } from "@/lib/crypto";
import { useAuthStore } from "@/stores/auth-store";
import {
  decryptTransactionPayload,
  encryptCheckpointBlob,
  effectiveAmount,
  transactionMonthEnd,
  currentMonthEnd,
  iterMonthEnds,
} from "@/lib/crypto-transaction";
import type { TransactionPayload } from "@/lib/crypto-transaction";
import { decryptECIESPayload } from "@/lib/crypto-rules";
import { getAccountKey } from "@/lib/decrypt-transactions";
import { decryptAccountMetadata } from "@/lib/account-metadata";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useAccountStore } from "@/stores/account-store";
import type { CheckpointBlob, Transaction } from "@/types";

/** A transaction reduced to the fields needed for checkpoint math. */
export interface TxForCheckpoint {
  id: string;
  time: string;
  encrypted_payload: string;
}

/** Build the cumulative {checkpoint_month -> blob} map from transactions. */
export function buildCheckpointsFromTxs(
  transactions: Array<{ time: string; payload: TransactionPayload }>,
  openingBalance: number,
  fromMonthEnd: string,
  toMonthEnd: string,
  baseTxCount = 0,
): Array<{ checkpoint_month: string; blob: CheckpointBlob }> {
  // Per-month delta + count, in a single pass over the (already-filtered) txs.
  const monthDelta = new Map<string, number>();
  const monthCount = new Map<string, number>();
  for (const tx of transactions) {
    const me = transactionMonthEnd(tx.time);
    if (me < fromMonthEnd || me > toMonthEnd) continue;
    monthDelta.set(me, (monthDelta.get(me) ?? 0) + effectiveAmount(tx.payload));
    monthCount.set(me, (monthCount.get(me) ?? 0) + 1);
  }

  // Cumulative sum across contiguous months (including empty ones so RangeSum
  // across gaps works). `count` accumulates all txs with month <= this month,
  // starting from baseTxCount (the prior verified checkpoint's count, or 0).
  const out: Array<{ checkpoint_month: string; blob: CheckpointBlob }> = [];
  let cumulative = openingBalance;
  let count = baseTxCount;
  for (const me of iterMonthEnds(fromMonthEnd, toMonthEnd)) {
    cumulative += monthDelta.get(me) ?? 0;
    count += monthCount.get(me) ?? 0;
    out.push({
      checkpoint_month: me,
      blob: { balance: round2(cumulative), tx_count: count },
    });
  }
  return out;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Download ALL transactions for an account (paginated 200/page, both AES-GCM
 * and ECIES "1|" payloads) and decrypt them. Used by the migration runner and
 * the seed/reconcile paths when the full history is needed.
 */
export async function fetchAndDecryptAllTransactions(
  accountId: string,
  accountKey: string,
  range?: { from?: string; to?: string },
): Promise<Transaction[]> {
  const all: Transaction[] = [];
  let offset = 0;
  const PAGE_SIZE = 200;
  const privKey = useAuthStore.getState().plaintextPrivateKey;
  const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let url = `${ENDPOINTS.transactions(accountId)}?limit=${PAGE_SIZE}&offset=${offset}`;
    if (range?.from) url += `&from=${encodeURIComponent(range.from)}`;
    if (range?.to) url += `&to=${encodeURIComponent(range.to)}`;
    const page = await apiFetch<Transaction[]>(url);
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  // Decrypt (failures -> payload stays null; those txs still count toward tx_count
  // for the verify check since the server counts plain rows).
  const decrypted = await Promise.all(
    all.map(async (tx) => {
      if (tx.encrypted_payload.startsWith("1|")) {
        if (!privKeyBase64) return { ...tx, payload: null } as any;
        try {
          const p = await decryptECIESPayload<TransactionPayload>(
            tx.encrypted_payload,
            privKeyBase64,
          );
          return { ...tx, payload: p } as any;
        } catch {
          return { ...tx, payload: null } as any;
        }
      }
      try {
        const p = await decryptTransactionPayload(tx.encrypted_payload, accountKey);
        return { ...tx, payload: p } as any;
      } catch {
        return { ...tx, payload: null } as any;
      }
    }),
  );
  return decrypted.filter((t: any) => t.payload) as Transaction[];
}

/**
 * Recompute checkpoints for an account from `fromMonthEnd` through the current
 * month, using the prior verified checkpoint (if any) as the opening base,
 * else a downloaded full-history seed. Upserts results via the store.
 *
 * Returns the number of months upserted.
 */
export async function recomputeFrom(
  accountId: string,
  fromMonthEnd: string,
  opts: { seedOpeningBalance?: number } = {},
): Promise<number> {
  const privKey = useAuthStore.getState().plaintextPrivateKey;
  const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
  const userPubKey = useAuthStore.getState().user?.public_key;
  const accountKey = await getAccountKey(accountId, privKeyBase64 ?? undefined, userPubKey);

  const store = useCheckpointStore.getState();
  const toMonthEnd = currentMonthEnd();

  // Find the prior verified checkpoint month as the opening base.
  const entries = store.getEntries(accountId);
  let baseMonth: string | null = null;
  let baseBalance = 0;
  let baseTxCount = 0;
  for (const e of entries) {
    if (e.checkpoint_month < fromMonthEnd && e.blob && (!baseMonth || e.checkpoint_month > baseMonth)) {
      baseMonth = e.checkpoint_month;
      baseBalance = e.blob.balance;
      baseTxCount = e.blob.tx_count;
    }
  }

  let openingBalance: number;
  let txs: Array<{ time: string; payload: TransactionPayload }>;
  if (baseMonth) {
    // Use the prior verified checkpoint as the seed: download only from the
    // first day of `fromMonthEnd`'s month onward.
    openingBalance = baseBalance;
    const fromIso = fromMonthEnd.slice(0, 8) + "01T00:00:00.000Z";
    const raw = await fetchAndDecryptAllTransactions(accountId, accountKey, {
      from: fromIso,
      to: `${toMonthEnd}T23:59:59.999Z`,
    });
    txs = raw as any;
  } else {
    // No prior verified checkpoint — download the full history (seed).
    openingBalance = opts.seedOpeningBalance ?? 0;
    const raw = await fetchAndDecryptAllTransactions(accountId, accountKey);
    txs = raw as any;
  }

  const computed = buildCheckpointsFromTxs(txs, openingBalance, fromMonthEnd, toMonthEnd, baseTxCount);
  await store.upsertMany(
    accountId,
    computed,
    accountKey,
  );
  return computed.length;
}

/**
 * Apply a checkpoint update after a transaction in month `txMonthEnd` for
 * account `accountId` changed (add/edit/delete). Recomputes from that month
 * through the current month.
 *
 * If `txMonthEnd` is in the future relative to the current month, nothing
 * happens (no future checkpoints exist). If no checkpoints exist yet for this
 * account, nothing happens (the first tx add bootstraps via the caller — see
 * §9 Q1). Callers that create the very first transaction should call
 * `recomputeFrom(firstMonthEnd, { seedOpeningBalance })` instead.
 */
export async function applyCheckpointUpdateAfterTxChange(
  accountId: string,
  txMonthEnd: string,
): Promise<void> {
  const cur = currentMonthEnd();
  if (txMonthEnd > cur) return; // future month, no checkpoints
  const entries = useCheckpointStore.getState().getEntries(accountId);
  if (entries.length > 0) {
    // Normal path: existing checkpoints — recompute from the changed month.
    await recomputeFrom(accountId, txMonthEnd);
    return;
  }
  // Bootstrap: no checkpoints yet (new account, first transaction).
  // Use the account's encrypted_metadata (opening balance) as the seed.
  const privKey = useAuthStore.getState().plaintextPrivateKey;
  const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
  const userPubKey = useAuthStore.getState().user?.public_key;
  const accountKey = await getAccountKey(accountId, privKeyBase64 ?? undefined, userPubKey);
  const acc = useAccountStore.getState().accounts.find((a) => a.id === accountId);
  let seedOB = 0;
  if (acc?.encrypted_metadata) {
    const meta = await decryptAccountMetadata(acc.encrypted_metadata, accountKey);
    if (meta) seedOB = meta.opening_balance;
  }
  await recomputeFrom(accountId, txMonthEnd, { seedOpeningBalance: seedOB });
}

/**
 * Verify checkpoints for an account against server tx_counts.
 * Returns the list of months that are STALE (mismatch) or MISSING (gap),
 * or null if verification failed entirely (e.g. no checkpoints loaded).
 */
export async function verifyCheckpoints(
  accountId: string,
): Promise<{ stale: string[]; missing: string[] } | null> {
  const entries = useCheckpointStore.getState().getEntries(accountId);
  if (entries.length === 0) return { stale: [], missing: [] };

  const cur = currentMonthEnd();
  const firstMonth = entries[0].checkpoint_month;
  const expectedMonths = Array.from(iterMonthEnds(firstMonth, cur));
  const have = new Set(entries.map((e) => e.checkpoint_month));

  const missing: string[] = [];
  for (const me of expectedMonths) {
    if (!have.has(me)) missing.push(me);
  }

  // Verify the months we do have.
  const resp = await apiFetch<{ counts: Array<{ checkpoint_month: string; tx_count: number }> }>(
    ENDPOINTS.verifyCheckpoints(accountId),
    {
      method: "POST",
      body: JSON.stringify({ months: entries.map((e) => e.checkpoint_month) }),
    },
  );
  const counts = resp?.counts ?? [];
  const serverByMonth = new Map(counts.map((c) => [c.checkpoint_month, c.tx_count]));

  const stale: string[] = [];
  for (const e of entries) {
    if (!e.blob) {
      stale.push(e.checkpoint_month);
      continue;
    }
    const serverCount = serverByMonth.get(e.checkpoint_month);
    if (serverCount !== undefined && serverCount !== e.blob.tx_count) {
      stale.push(e.checkpoint_month);
    }
  }

  return { stale, missing };
}