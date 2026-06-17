/**
 * Transaction payload encryption helpers.
 *
 * Per AGENTS.md: JSON Payload → Compress (LZ4) → Encrypt (AES-256-GCM) → Base64
 *
 * The encrypted payload contains: amount, category, notes, counterparty.
 * For now LZ4 compression is a pass-through (stub).
 */

import { encryptData, decryptData, compress, decompress } from "./crypto";

export interface TransactionPayload {
  amount: number;
  category: string;
  notes: string;
  counterparty: string;
  commission?: number; // fee added to amount; default 0
  interest_amount?: number; // mortgage interest portion (rule-generated only)
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
