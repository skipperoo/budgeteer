/**
 * Transaction decryption utilities.
 *
 * Decrypts encrypted transaction payloads using the account key stored in
 * account_users.encrypted_account_key (ECIES-encrypted with the user's X25519
 * public key).
 */

import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { decryptAccountKeyForRecipient } from "@/lib/crypto";
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

/**
 * Decrypt a single transaction's payload using the account key.
 */
export async function decryptTx(
  tx: Transaction,
  accountKeyBase64: string
): Promise<DecryptedTransaction> {
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
}

/**
 * Fetch and decrypt the account key for a given account.
 *
 * The encrypted_account_key is stored as "ephemeralPublicKey:ciphertext"
 * (both base64). We need the user's X25519 private key to decrypt it.
 */
export async function getAccountKey(
  accountId: string,
  userPrivateKeyBase64: string
): Promise<string> {
  const users = await apiFetch<AccountUser[]>(ENDPOINTS.accountUsers(accountId));
  // The current user's entry is where we find the encrypted key for us
  // (we need to figure out which entry is ours — we pass all and try each)
  for (const au of users) {
    const parts = au.encrypted_account_key.split(":");
    if (parts.length === 2) {
      try {
        const key = await decryptAccountKeyForRecipient(
          parts[1], // ciphertext
          parts[0], // ephemeral public key
          userPrivateKeyBase64
        );
        return key;
      } catch {
        continue; // not our entry, try next
      }
    }
  }
  throw new Error("Could not decrypt account key — no matching entry found");
}

/**
 * Fetch transactions for an account and decrypt them all.
 * Returns transactions sorted by time descending (newest first).
 */
export async function fetchAndDecryptTransactions(
  accountId: string,
  userPrivateKeyBase64: string
): Promise<DecryptedTransaction[]> {
  const accountKey = await getAccountKey(accountId, userPrivateKeyBase64);
  const txs = await apiFetch<Transaction[]>(ENDPOINTS.transactions(accountId));
  if (!txs || txs.length === 0) return [];

  const decrypted = await Promise.all(
    txs.map((tx) => decryptTx(tx, accountKey))
  );
  return decrypted.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );
}
