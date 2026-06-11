/**
 * Transaction decryption utilities.
 *
 * Decrypts encrypted transaction payloads using the account key stored in
 * account_users.encrypted_account_key (ECIES-encrypted with the user's X25519
 * public key).
 */

import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { decryptAccountKeyForRecipient, encryptAccountKeyForRecipient, generateAccountKey } from "@/lib/crypto";
import { decryptTransactionPayload } from "@/lib/crypto-transaction";
import type { AccountUser, Transaction } from "@/types";
import type { TransactionPayload } from "@/lib/crypto-transaction";

export interface DecryptedTransaction {
  id: string;
  time: string;
  account_id: string;
  created_by: string;
  payload: TransactionPayload;
}

/** A transaction whose payload may or may not have decrypted. */
export interface DecryptResult {
  id: string;
  time: string;
  account_id: string;
  created_by: string;
  payload: TransactionPayload | null;
  decryptError?: string;
}

/**
 * Decrypt a single transaction's payload using the account key.
 * Returns null for the payload if decryption fails (instead of throwing),
 * so a single bad transaction doesn't break a whole batch.
 */
export async function decryptTx(
  tx: Transaction,
  accountKeyBase64: string
): Promise<DecryptResult> {
  try {
    const payload = await decryptTransactionPayload(
      tx.encrypted_payload,
      accountKeyBase64
    );
    return {
      id: tx.id,
      time: tx.time,
      account_id: tx.account_id,
      created_by: tx.created_by,
      payload,
    };
  } catch {
    return {
      id: tx.id,
      time: tx.time,
      account_id: tx.account_id,
      created_by: tx.created_by,
      payload: null,
      decryptError: "Decryption failed",
    };
  }
}

/** Filter a DecryptResult[] to only successfully-decrypted transactions. */
export function filterDecrypted(
  results: DecryptResult[]
): DecryptedTransaction[] {
  return results.filter(
    (r): r is DecryptedTransaction & { payload: TransactionPayload } =>
      r.payload !== null
  );
}

// ---------------------------------------------------------------------------
// SessionStorage account key cache
//
// The decrypted account key is cached in sessionStorage so it survives page
// refreshes (but NOT tab close — sessionStorage is per-tab ephemeral).
// This avoids requiring the user to re-enter their password on every page
// load just to create transactions.
// ---------------------------------------------------------------------------

function cacheKeyName(accountId: string): string {
  return `budgeteer_account_key_${accountId}`;
}

/** Retrieve a cached account key from sessionStorage, or null. */
export function getCachedAccountKey(accountId: string): string | null {
  try {
    return sessionStorage.getItem(cacheKeyName(accountId));
  } catch {
    return null;
  }
}

/** Store a decrypted account key in sessionStorage. */
function setCachedAccountKey(accountId: string, key: string): void {
  try {
    sessionStorage.setItem(cacheKeyName(accountId), key);
  } catch {
    // sessionStorage may be unavailable (private browsing, quota, etc.)
  }
}

/**
 * Fetch and decrypt (or retrieve from cache) the account key for a given account.
 *
 * The encrypted_account_key is stored as "ephemeralPublicKey:ciphertext"
 * (both base64). We need the user's X25519 private key to decrypt it.
 *
 * @param userPrivateKeyBase64 - Optional. If omitted, only the sessionStorage
 *   cache is checked (and key generation with userPublicKey).
 * @param userPublicKey - Optional. If no encrypted key matches and this is
 *   provided, a new account key is generated and stored server-side.
 */
export async function getAccountKey(
  accountId: string,
  userPrivateKeyBase64?: string,
  userPublicKey?: string
): Promise<string> {
  // 1. Check sessionStorage cache first
  const cached = getCachedAccountKey(accountId);
  if (cached) return cached;

  // 2. If we have the private key, try to decrypt the server-side key
  if (userPrivateKeyBase64) {
    const users = await apiFetch<AccountUser[]>(ENDPOINTS.accountUsers(accountId));
    for (const au of users) {
      const parts = au.encrypted_account_key.split(":");
      if (parts.length === 2) {
        try {
          const key = await decryptAccountKeyForRecipient(
            parts[1], // ciphertext
            parts[0], // ephemeral public key
            userPrivateKeyBase64
          );
          setCachedAccountKey(accountId, key);
          return key;
        } catch {
          continue; // not our entry, try next
        }
      }
    }
  }

  // 3. No decryptable key found — generate a new one and store it
  if (userPublicKey) {
    const newKey = generateAccountKey();
    const enc = await encryptAccountKeyForRecipient(newKey, userPublicKey);
    const payload = `${enc.ephemeralPublicKey}:${enc.ciphertext}`;
    await apiFetch(ENDPOINTS.accountKey(accountId), {
      method: "PUT",
      body: JSON.stringify({ encrypted_account_key: payload }),
    });
    setCachedAccountKey(accountId, newKey);
    return newKey;
  }

  throw new Error(
    "Could not decrypt account key. Please re-login to restore your encryption keys."
  );
}

/**
 * Fetch transactions for an account and decrypt them all.
 * Returns transactions sorted by time descending (newest first).
 */
export async function fetchAndDecryptTransactions(
  accountId: string,
  userPrivateKeyBase64?: string,
  userPublicKey?: string
): Promise<DecryptedTransaction[]> {
  const accountKey = await getAccountKey(accountId, userPrivateKeyBase64, userPublicKey);
  const txs = await apiFetch<Transaction[]>(ENDPOINTS.transactions(accountId));
  if (!txs || txs.length === 0) return [];

  const results = await Promise.all(
    txs.map((tx) => decryptTx(tx, accountKey))
  );
  return filterDecrypted(results).sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );
}

/**
 * Like fetchAndDecryptTransactions, but returns ALL results (including
 * failed decryptions) so the caller can render "Could not decrypt" entries.
 */
export async function fetchAndDecryptTransactionsWithErrors(
  accountId: string,
  userPrivateKeyBase64: string,
  userPublicKey?: string
): Promise<DecryptResult[]> {
  const accountKey = await getAccountKey(accountId, userPrivateKeyBase64, userPublicKey);
  const txs = await apiFetch<Transaction[]>(ENDPOINTS.transactions(accountId));
  if (!txs || txs.length === 0) return [];

  const results = await Promise.all(
    txs.map((tx) => decryptTx(tx, accountKey))
  );
  return results.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );
}
