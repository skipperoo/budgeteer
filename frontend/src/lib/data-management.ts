import JSZip from "jszip";
import { ENDPOINTS } from "./constants";
import { apiFetch, getToken } from "./api";
import {
  bytesToBase64,
  decryptData,
  generateAccountKey,
  decryptAccountKeyForRecipient,
  encryptAccountKeyForRecipient,
} from "./crypto";
import {
  decryptTransactionPayload,
  encryptTransactionPayload,
  decryptCheckpointBlob,
  encryptCheckpointBlob,
  type TransactionPayload,
} from "./crypto-transaction";
import { decryptECIESPayload, encryptForRecipient, isECIESPayload } from "./crypto-rules";
import { decryptAccountMetadata, encryptAccountMetadata } from "./account-metadata";
import { useAuthStore } from "../stores/auth-store";
import type {
  Account,
  AccountUser,
  Budget,
  Transaction,
  UserCategory,
} from "../types";

// ---------------------------------------------------------------------------
// Types (mirror backend JSON schema for dump/restore)
// ---------------------------------------------------------------------------

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: string;
  is_read: boolean;
  created_at: string;
}

interface TransactionDocument {
  id: string;
  transaction_id: string;
  encrypted_data?: string;
  mime_type: string;
  file_name: string;
  file_size: number;
  created_at: string;
}

export interface UserDump {
  id: string;
  email: string;
  public_key: string;
  encrypted_private_key: string;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AccountDumpData {
  account: Account;
  account_user: AccountUser;
  transactions: Transaction[];
  documents: TransactionDocument[];
  checkpoints?: Array<{ account_id: string; checkpoint_month: string; encrypted_balance: string; created_at: string; updated_at: string }>;
}

export interface UserDataDump {
  user: UserDump;
  accounts: AccountDumpData[];
  categories: UserCategory[];
  budgets: Budget[];
  rules: RuleDump[];
  notifications: Notification[];
  invitations_sent: InvitationDump[];
  invitations_received: InvitationDump[];
  savings_plans: SavingsPlanDump[];
  recurring_transactions: RecurringTransactionDump[];
}

interface RuleDump {
  id: string;
  created_by: string;
  name: string;
  encrypted_payload: string;
  frequency: string;
  next_occurrence: string;
  end_date?: string;
  max_occurrences?: number;
  occurrences_so_far: number;
  is_active: boolean;
  status: string;
  target_email?: string;
  target_account_encrypted?: string;
  alert_offset?: string;
  created_at: string;
  updated_at: string;
}

interface InvitationDump {
  id: string;
  entity_type: string;
  entity_id: string;
  invited_by: string;
  invited_email: string;
  invited_user_id?: string;
  encrypted_data?: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface SavingsPlanDump {
  id: string;
  account_id: string;
  source_account_id?: string;
  created_by: string;
  currency: string;
  tracking_start: string;
  tracking_end: string;
  last_logged_at?: string;
  encrypted_payload: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RecurringTransactionDump {
  id: string;
  account_id: string;
  created_by: string;
  frequency: string;
  next_occurrence: string;
  end_date?: string;
  encrypted_payload: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrivateKeyBase64(): string {
  const auth = useAuthStore.getState();
  if (auth.plaintextPrivateKey) {
    return bytesToBase64(new Uint8Array(auth.plaintextPrivateKey));
  }
  throw new Error("Encryption key unavailable. Please re-enter your password.");
}

// ---------------------------------------------------------------------------
// Dump decryption  (before zipping)
// ---------------------------------------------------------------------------

/**
 * Decrypt all encrypted payloads in a dump using the user's keys.
 * Mutates the dump in place — replaces encrypted blobs with plaintext JSON.
 */
export async function decryptDump(dump: UserDataDump): Promise<void> {
  const userPrivateKey = getPrivateKeyBase64();

  // ---- Step 1: decrypt account keys ----
  const accountKeyMap = new Map<string, string>();
  for (const ad of dump.accounts ?? []) {
    const parts = ad.account_user.encrypted_account_key?.split(":");
    if (parts && parts.length === 2) {
      try {
        const key = await decryptAccountKeyForRecipient(
          parts[1], parts[0], userPrivateKey,
        );
        accountKeyMap.set(ad.account.id, key);
      } catch {
        // cannot decrypt account key
      }
    }
  }

  // ---- Step 2: decrypt transactions ----
  for (const ad of dump.accounts ?? []) {
    const accountKey = accountKeyMap.get(ad.account.id);
    if (!accountKey) continue;
    for (const tx of ad.transactions ?? []) {
      try {
        if (isECIESPayload(tx.encrypted_payload)) {
          const d = await decryptECIESPayload<TransactionPayload>(
            tx.encrypted_payload, userPrivateKey,
          );
          tx.encrypted_payload = JSON.stringify(d);
        } else {
          const d = await decryptTransactionPayload(tx.encrypted_payload, accountKey);
          tx.encrypted_payload = JSON.stringify(d);
        }
      } catch {
        // keep as-is
      }
    }
  }

  // ---- Step 3: decrypt recurring transactions (use account key) ----
  for (const rt of dump.recurring_transactions ?? []) {
    const accountKey = accountKeyMap.get(rt.account_id);
    if (!accountKey) continue;
    try {
      rt.encrypted_payload = await decryptData(rt.encrypted_payload, accountKey);
    } catch {
      // keep as-is
    }
  }

  // ---- Step 4: decrypt ECIES payloads (budgets) ----
  for (const b of dump.budgets ?? []) {
    try {
      if (isECIESPayload(b.encrypted_payload)) {
        const d = await decryptECIESPayload(b.encrypted_payload, userPrivateKey);
        b.encrypted_payload = JSON.stringify(d);
      }
    } catch {
      // keep as-is
    }
  }
  // Rule payloads are already decrypted server-side

  // ---- Step 5: decrypt account metadata + checkpoints (account key) ----
  for (const ad of dump.accounts ?? []) {
    const accountKey = accountKeyMap.get(ad.account.id);
    if (!accountKey) continue;
    // Account metadata blob -> plaintext JSON string.
    if (ad.account.encrypted_metadata) {
      const meta = await decryptAccountMetadata(ad.account.encrypted_metadata, accountKey);
      ad.account.encrypted_metadata = meta ? JSON.stringify(meta) : null;
    }
    // Checkpoints -> plaintext JSON {balance, tx_count} per row.
    if (ad.checkpoints && ad.checkpoints.length > 0) {
      for (const cp of ad.checkpoints) {
        try {
          const blob = await decryptCheckpointBlob(cp.encrypted_balance, accountKey);
          cp.encrypted_balance = blob ? JSON.stringify(blob) : "";
        } catch {
          // keep as-is
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Dump — download helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the encrypted dump from the server, decrypt everything, and
 * download as a zip of plaintext JSON files.
 */
export async function downloadDumpZip(): Promise<void> {
  const dump = await fetchDump();
  await decryptDump(dump);

  const zip = new JSZip();
  zip.file("user.json", JSON.stringify(dump.user, null, 2));

  const accountsFolder = zip.folder("accounts");
  if (accountsFolder && dump.accounts) {
    for (const ad of dump.accounts) {
      const fileName = `${ad.account.name || ad.account.id}.json`;
      accountsFolder.file(fileName, JSON.stringify(ad, null, 2));
    }
  }

  const addJson = (name: string, data: unknown) =>
    zip.file(name, JSON.stringify(data, null, 2));

  addJson("categories.json", dump.categories);
  addJson("budgets.json", dump.budgets);
  addJson("rules.json", dump.rules);
  addJson("notifications.json", dump.notifications);
  addJson("invitations_sent.json", dump.invitations_sent);
  addJson("invitations_received.json", dump.invitations_received);
  addJson("savings_plans.json", dump.savings_plans);
  addJson("recurring_transactions.json", dump.recurring_transactions);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budgeteer-${dump.user.email}-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Restore helpers
// ---------------------------------------------------------------------------

/**
 * Parse a previously downloaded zip and return the plaintext UserDataDump.
 */
export async function parseRestoreZip(file: File): Promise<UserDataDump> {
  const zip = await JSZip.loadAsync(file);

  const result: Partial<UserDataDump> = {};

  const userFile = zip.file("user.json");
  if (userFile) {
    const content = await userFile.async("string");
    result.user = JSON.parse(content);
  }

  const accountsFolder = zip.folder("accounts");
  if (accountsFolder) {
    const accountFiles: AccountDumpData[] = [];
    const promises: Promise<void>[] = [];
    accountsFolder.forEach((_path, entry) => {
      if (!entry.dir) {
        promises.push(
          entry.async("string").then((c) => { accountFiles.push(JSON.parse(c)); }),
        );
      }
    });
    await Promise.all(promises);
    result.accounts = accountFiles;
  }

  async function readJson(name: string): Promise<unknown> {
    const f = zip.file(name);
    return f ? JSON.parse(await f.async("string")) : null;
  }

  result.categories = (await readJson("categories.json")) as UserCategory[];
  result.budgets = (await readJson("budgets.json")) as Budget[];
  result.rules = (await readJson("rules.json")) as RuleDump[];
  // Notifications, invitations, savings_plans, recurring_transactions
  // from the zip are ignored during restore — only the data above is restored.

  return result as UserDataDump;
}

// ---------------------------------------------------------------------------
// Restore — calls individual creation endpoints so the backend generates
// fresh UUIDs for everything.  Re-encrypts all payloads with the current
// user's keys (the user performing the restore).  The dump origin user's
// keys are NEVER used.
// ---------------------------------------------------------------------------

/**
 * Restore all data from a parsed dump by calling the regular creation
 * endpoints one by one.
 *
 * Order:
 *   1. Categories
 *   2. Accounts (each with a fresh random account key)
 *   3. Transactions for each account (re-encrypted with the new key)
 *   4. Budgets (re-encrypted via ECIES with the current user's public key)
 *   5. Rules (re-encrypted via ECIES with the server's public key)
 *
 * Notifications, invitations, savings_plans, recurring_transactions are
 * skipped (not fully implemented or not needed for state reconstruction).
 */
export async function restoreFromDump(dump: UserDataDump): Promise<void> {
  const auth = useAuthStore.getState();
  const user = auth.user;
  if (!user) throw new Error("User not found. Please log in.");

  // ---- Step 0: Clear ALL existing data — restore is destructive ----
  const token = getToken();
  const clearRes = await fetch(ENDPOINTS.userClear, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!clearRes.ok) {
    const body = await clearRes.json().catch(() => ({ error: clearRes.statusText }));
    throw new Error(body.error || "Failed to clear existing data");
  }

  // Fetch server's X25519 public key (needed for rule re-encryption)
  let serverPublicKey = "";
  try {
    const res = await fetch(ENDPOINTS.rulePublicKey, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = (await res.json()) as { public_key: string };
      serverPublicKey = data.public_key;
    }
  } catch {
    // server key unavailable — rules will stay as plaintext
  }

  // ---- 1. Categories ----
  // Old categories with the same name+type as an existing one are skipped
  // gracefully (unique constraint on user_id, name, type).
  const categoryIdMap = new Map<string, string>(); // old ID → new ID
  for (const cat of dump.categories ?? []) {
    try {
      const created = await apiFetch<UserCategory>(ENDPOINTS.categories, {
        method: "POST",
        body: JSON.stringify({ name: cat.name, type: cat.type }),
      });
      categoryIdMap.set(cat.id, created.id);
    } catch {
      // skip duplicate categories
    }
  }

  // ---- 2. Accounts + 3. Transactions ----
  // Mapping: old account ID → { new account ID, fresh account key (base64) }
  const accountMap = new Map<string, { newId: string; key: string }>();

  for (const ad of dump.accounts ?? []) {
    // Generate a fresh AES-256 account key
    const newKey = generateAccountKey();
    const enc = await encryptAccountKeyForRecipient(newKey, user.public_key);
    const encryptedKey = `${enc.ephemeralPublicKey}:${enc.ciphertext}`;

    // Create the account via the regular endpoint
    const created = await apiFetch<Account>(ENDPOINTS.accounts, {
      method: "POST",
      body: JSON.stringify({
        name: ad.account.name,
        currency: ad.account.currency,
        type: ad.account.type,
        encrypted_account_key: encryptedKey,
      }),
    });

    accountMap.set(ad.account.id, { newId: created.id, key: newKey });

    // Re-encrypt account metadata (opening balance) with the new account key,
    // then PUT it (plaintext was restored as JSON by decryptDump).
    if (ad.account.encrypted_metadata) {
      try {
        const meta = JSON.parse(ad.account.encrypted_metadata) as { opening_balance_cents: number };
        const encMeta = await encryptAccountMetadata(meta, newKey);
        await apiFetch(ENDPOINTS.account(created.id), {
          method: "PUT",
          body: JSON.stringify({
            name: ad.account.name,
            currency: ad.account.currency,
            type: ad.account.type,
            encrypted_metadata: encMeta,
          }),
        });
      } catch {
        // metadata optional
      }
    }

    // Re-encrypt checkpoints with the new account key and bulk-PUT them.
    if (ad.checkpoints && ad.checkpoints.length > 0) {
      const rows = [];
      for (const cp of ad.checkpoints) {
        try {
          const blob = JSON.parse(cp.encrypted_balance) as { balance: number; tx_count: number };
          const enc = await encryptCheckpointBlob(blob, newKey);
          rows.push({ checkpoint_month: cp.checkpoint_month, encrypted_balance: enc });
        } catch {
          // skip undecryptable checkpoint
        }
      }
      if (rows.length > 0) {
        try {
          await apiFetch(ENDPOINTS.checkpoints(created.id), {
            method: "PUT",
            body: JSON.stringify({ checkpoints: rows }),
          });
        } catch {
          // checkpoints optional — restore continues
        }
      }
    }

    // Create transactions for this account
    for (const tx of ad.transactions ?? []) {
      let parsed: TransactionPayload;
      try {
        parsed = JSON.parse(tx.encrypted_payload) as TransactionPayload;
      } catch {
        // skip transactions that couldn't be decrypted
        continue;
      }

      const encryptedPayload = await encryptTransactionPayload(parsed, newKey);

      await apiFetch<Transaction>(ENDPOINTS.transactions(created.id), {
        method: "POST",
        body: JSON.stringify({
          encrypted_payload: encryptedPayload,
          time: tx.time,
        }),
      });
    }
  }

  // ---- 4. Budgets ----
  for (const b of dump.budgets ?? []) {
    // Map old account_id → new account_id if the budget references an account
    let mappedAccountId: string | undefined;
    if (b.account_id) {
      const mapped = accountMap.get(b.account_id);
      if (mapped) {
        mappedAccountId = mapped.newId;
      }
      // If account not found in the map (e.g. joint account not being restored),
      // skip the budget to avoid a foreign-key violation
      if (!mappedAccountId) continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(b.encrypted_payload);
    } catch {
      continue;
    }

    const encrypted = await encryptForRecipient(parsed, user.public_key);

    await apiFetch<Budget>(ENDPOINTS.budgets, {
      method: "POST",
      body: JSON.stringify({
        name: b.name,
        account_id: mappedAccountId,
        encrypted_payload: encrypted,
        period: b.period,
        start_date: b.start_date,
        end_date: b.end_date,
      }),
    });
  }

  // ---- 5. Rules ----
  for (const rule of dump.rules ?? []) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rule.encrypted_payload);
    } catch {
      continue;
    }

    const encrypted = serverPublicKey
      ? await encryptForRecipient(parsed, serverPublicKey)
      : rule.encrypted_payload; // fallback: keep as plaintext

    await apiFetch(ENDPOINTS.rules, {
      method: "POST",
      body: JSON.stringify({
        name: rule.name,
        encrypted_payload: encrypted,
        frequency: rule.frequency,
        next_occurrence: rule.next_occurrence,
        end_date: rule.end_date || undefined,
        max_occurrences: rule.max_occurrences || undefined,
        alert_offset: rule.alert_offset || undefined,
      }),
    });
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function fetchDump(): Promise<UserDataDump> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(ENDPOINTS.userDump, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Dump failed: ${res.status}`);
  }

  return res.json();
}

export async function deleteAccount(confirmation: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(ENDPOINTS.userDelete, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmation }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Delete failed: ${res.status}`);
  }
}
