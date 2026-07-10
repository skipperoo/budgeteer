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
