/**
 * Transaction payload encryption helpers.
 *
 * Per AGENTS.md: JSON Payload → Compress (LZ4) → Encrypt (AES-256-GCM) → Base64
 *
 * The encrypted payload contains: amount, category, notes, counterparty,
 * commission, interest_amount, and transfer fields (is_transfer, transfer_pair_id,
 * transfer_source_account_id, transfer_target_account_id, etc.).
 * For now LZ4 compression is a pass-through (stub).
 */

import { encryptData, decryptData, compress, decompress } from "./crypto";

export interface TransactionPayload {
  amount: number;
  category: string;
  category_id?: string; // stable UUID linking to user_categories; enables id-based lookup on rename/delete
  notes: string;
  counterparty: string;
  commission?: number; // fee added to amount; default 0
  interest_amount?: number; // mortgage interest portion (rule-generated only)
  /** True when this transaction is one side of an account-to-account transfer. */
  is_transfer?: boolean;
  /** UUID linking the source and target transactions of a transfer. */
  transfer_pair_id?: string;
  /** The source account ID for the transfer (expense side). */
  transfer_source_account_id?: string;
  /** The target account ID for the transfer (income side). */
  transfer_target_account_id?: string;
  /** Display name of the source account. */
  transfer_source_account_name?: string;
  /** Display name of the target account. */
  transfer_target_account_name?: string;
}

/**
 * Encrypt a transaction payload with the account key.
 * Returns a base64-encoded ciphertext.
 */
export async function encryptTransactionPayload(
  payload: TransactionPayload,
  accountKeyBase64: string
): Promise<string> {
  const json = JSON.stringify(payload);
  const compressed = compress(json);
  return encryptData(compressed, accountKeyBase64);
}

/**
 * Compute the effective amount of a transaction including commission.
 *
 * For expenses (amount < 0): total = amount - commission (more negative).
 * For income   (amount > 0): total = amount - commission (less positive).
 *
 * This is the actual amount that hits the account balance.
 */
export function effectiveAmount(payload: TransactionPayload): number {
  return payload.amount - (payload.commission ?? 0);
}

/**
 * Returns true if the payload represents an account-to-account transfer.
 */
export function isTransferPayload(payload: TransactionPayload): boolean {
  return payload.is_transfer === true && !!payload.transfer_pair_id;
}

/**
 * Extract the transfer pair ID from a payload, or null if not a transfer.
 */
export function getTransferPairId(payload: TransactionPayload): string | null {
  return payload.is_transfer && payload.transfer_pair_id ? payload.transfer_pair_id : null;
}

/**
 * Strip transfer-specific fields from a payload, converting it back to a
 * regular transaction payload. Used when a user toggles a transfer back to
 * a normal transaction.
 */
export function stripTransferFields(payload: TransactionPayload): TransactionPayload {
  const {
    is_transfer,
    transfer_pair_id,
    transfer_source_account_id,
    transfer_target_account_id,
    transfer_source_account_name,
    transfer_target_account_name,
    ...rest
  } = payload;
  return rest;
}

/**
 * Decrypt a transaction payload from its encrypted form.
 */
export async function decryptTransactionPayload(
  encryptedPayload: string,
  accountKeyBase64: string
): Promise<TransactionPayload> {
  const decrypted = await decryptData(encryptedPayload, accountKeyBase64);
  const decompressed = decompress(decrypted);
  return JSON.parse(decompressed) as TransactionPayload;
}

// ============================================================
// Monthly balance checkpoint crypto (see /spec.md perf/checkpointing).
//
// The checkpoint blob uses the SAME AES-256-GCM account-key format as
// transaction payloads (NOT the ECIES "1|" format). The encrypted JSON is
// { balance: number (float, 2-dp), tx_count: number }.
// ============================================================

import type { CheckpointBlob } from "@/types";

/** Encrypt a checkpoint blob with the account key. */
export async function encryptCheckpointBlob(
  blob: CheckpointBlob,
  accountKeyBase64: string,
): Promise<string> {
  return encryptData(JSON.stringify(blob), accountKeyBase64);
}

/** Decrypt a checkpoint blob. Returns null on failure. */
export async function decryptCheckpointBlob(
  encryptedBalance: string,
  accountKeyBase64: string,
): Promise<CheckpointBlob | null> {
  try {
    const decrypted = await decryptData(encryptedBalance, accountKeyBase64);
    return JSON.parse(decrypted) as CheckpointBlob;
  } catch {
    return null;
  }
}

// ============================================================
// UTC month-bucketing helpers (see spec §2.3).
// Months are identified by their LAST UTC day as "YYYY-MM-DD".
// ============================================================

/**
 * Return the last UTC calendar day of the month containing `date`, as a
 * "YYYY-MM-DD" string (the checkpoint month identifier).
 */
export function monthEndOf(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  // Set to first day of next month (UTC), then subtract one day (UTC).
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-11
  const firstOfNext = new Date(Date.UTC(year, month + 1, 1));
  const last = new Date(firstOfNext.getTime() - 24 * 60 * 60 * 1000);
  return last.toISOString().slice(0, 10);
}

/**
 * Return the checkpoint month (last UTC day) of a transaction's time.
 */
export function transactionMonthEnd(time: string): string {
  return monthEndOf(new Date(time));
}

/**
 * Return the checkpoint month-end of the *current* UTC month (the live month).
 */
export function currentMonthEnd(): string {
  return monthEndOf(new Date());
}

/**
 * Return the checkpoint month-end of the month BEFORE the one containing `date`.
 */
export function previousMonthEnd(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 24 * 60 * 60 * 1000);
  return monthEndOf(prev);
}

/**
 * Iterate every month-end from `fromMonthEnd` to `toMonthEnd` inclusive,
 * ascending. Caller guarantees fromMonthEnd <= toMonthEnd.
 */
export function* iterMonthEnds(fromMonthEnd: string, toMonthEnd: string): Generator<string> {
  let [y, m] = fromMonthEnd.split("-").map(Number); // m is 1-12 here
  // Normalise: month-end of an existing month maps to that month.
  let cur = new Date(Date.UTC(y, m - 1, 1));
  // Convert to first-of-month of `fromMonthEnd`'s month.
  while (cur.toISOString().slice(0, 10) <= toMonthEnd) {
    yield monthEndOf(cur);
    // Advance one month.
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
}
