/**
 * Account-level encrypted metadata helpers.
 *
 * `accounts.encrypted_metadata` is an AES-256-GCM blob (the same format used for
 * account-key-encrypted transactions) holding a JSON object whose first field is
 * `opening_balance_cents` (integer cents, signed). It is encrypted with the
 * account key and can be read/written by the account owner and any joint member
 * (they share the key).
 *
 * See /spec.md (perf/checkpointing) §2.4, §4.2.
 */

import { encryptData, decryptData } from "./crypto";
import type { AccountMetadataBlob } from "@/types";

/**
 * Encrypt an account-metadata blob with the account key.
 * Returns a base64 ciphertext (iv || ciphertext), identical in format to
 * `encryptTransactionPayload` output.
 */
export async function encryptAccountMetadata(
  blob: AccountMetadataBlob,
  accountKeyBase64: string,
): Promise<string> {
  const json = JSON.stringify(blob);
  return encryptData(json, accountKeyBase64);
}

/**
 * Decrypt an account-metadata blob.
 * Returns null if the blob is empty or decryption fails.
 */
export async function decryptAccountMetadata(
  encryptedMetadata: string | null | undefined,
  accountKeyBase64: string,
): Promise<AccountMetadataBlob | null> {
  if (!encryptedMetadata) return null;
  try {
    const decrypted = await decryptData(encryptedMetadata, accountKeyBase64);
    return JSON.parse(decrypted) as AccountMetadataBlob;
  } catch {
    return null;
  }
}