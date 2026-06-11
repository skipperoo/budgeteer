import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAccountStore } from "@/stores/account-store";
import { useAuthStore } from "@/stores/auth-store";
import { useCategoryStore } from "@/stores/category-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { generateAccountKey, encryptAccountKeyForRecipient, bytesToBase64 } from "@/lib/crypto";
import { encryptTransactionPayload, decryptTransactionPayload } from "@/lib/crypto-transaction";
import { decryptAccountKeyForRecipient } from "@/lib/crypto";
import type { AccountUser, Transaction, CreateTransactionRequest } from "@/types";
import type { TransactionPayload } from "@/lib/crypto-transaction";

interface DecryptedTx extends Transaction {
  decryptedPayload?: TransactionPayload;
}

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
];

const ACCOUNT_TYPES = ["personal", "joint", "savings"] as const;

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accounts, accountUsers, fetchAccounts, fetchAccountUsers, updateAccount, inviteUser, removeUser } = useAccountStore();
  const account = accounts.find((a) => a.id === id);
  const currentUser = useAuthStore((s) => s.user);

  // --- Invite state ---
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);

  // --- Edit account state ---
  const [editOpen, setEditOpen] = useState(false);
  const [editCurrency, setEditCurrency] = useState("");
  const [editType, setEditType] = useState("");
  const [editError, setEditError] = useState("");
  const [editing, setEditing] = useState(false);

  // --- Decryption ---
  const plaintextPrivateKey = useAuthStore((s) => s.plaintextPrivateKey);
  const privKeyBase64 = plaintextPrivateKey
    ? bytesToBase64(new Uint8Array(plaintextPrivateKey))
    : null;
  const [accountKeyBase64, setAccountKeyBase64] = useState<string | null>(null);

  // --- Transaction state ---
  const [transactions, setTransactions] = useState<DecryptedTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState("");

  // --- Create transaction state ---
  const [createOpen, setCreateOpen] = useState(false);
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txCounterparty, setTxCounterparty] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txCreating, setTxCreating] = useState(false);
  const [txCreateError, setTxCreateError] = useState("");

  // Category combobox state
  const { getCategories, addCategory } = useCategoryStore();
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if (id) {
      fetchAccountUsers(id);
      fetchTransactions();
      fetchAccountKey();
    }
  }, [id, fetchAccountUsers]);

  // Fetch and decrypt the account key for this account.
  // If no key is found for the current user, generate one and store it.
  const fetchAccountKey = async () => {
    if (!id || !privKeyBase64) return;
    try {
      const users = await apiFetch<AccountUser[]>(ENDPOINTS.accountUsers(id));
      for (const au of users) {
        const parts = au.encrypted_account_key.split(":");
        if (parts.length === 2) {
          try {
            const key = await decryptAccountKeyForRecipient(
              parts[1], parts[0], privKeyBase64
            );
            setAccountKeyBase64(key);
            return;
          } catch { continue; }
        }
      }
      // No decryptable key found for current user — generate one and store it
      const newKey = generateAccountKey();
      const ownPubKey = currentUser?.public_key;
      if (ownPubKey) {
        const enc = await encryptAccountKeyForRecipient(newKey, ownPubKey);
        const payload = `${enc.ephemeralPublicKey}:${enc.ciphertext}`;
        await apiFetch(ENDPOINTS.accountKey(id), {
          method: "PUT",
          body: JSON.stringify({ encrypted_account_key: payload }),
        });
        setAccountKeyBase64(newKey);
      }
    } catch { /* no key available */ }
  };

  // Re-fetch accounts if we don't have this one yet
  useEffect(() => {
    if (id && !account && accounts.length === 0) {
      fetchAccounts();
    }
  }, [id, account, accounts.length, fetchAccounts]);

  const fetchTransactions = async () => {
    if (!id) return;
    setTxLoading(true);
    setTxError("");
    try {
      const data = await apiFetch<Transaction[]>(ENDPOINTS.transactions(id));
      const raw = data ?? [];

      // Try to decrypt each transaction if key is available
      const decrypted = await Promise.all(
        raw.map(async (tx) => {
          if (accountKeyBase64) {
            try {
              const payload = await decryptTransactionPayload(
                tx.encrypted_payload,
                accountKeyBase64
              );
              return { ...tx, decryptedPayload: payload } as DecryptedTx;
            } catch { /* fall through */ }
          }
          return tx as DecryptedTx;
        })
      );

      setTransactions(decrypted);
    } catch (err: any) {
      setTxError(err.message);
    } finally {
      setTxLoading(false);
    }
  };

  // Re-decrypt when account key changes
  useEffect(() => {
    if (accountKeyBase64 && transactions.length > 0) {
      fetchTransactions();
    }
  }, [accountKeyBase64]);

  // --- Edit account ---
  const openEdit = () => {
    if (!account) return;
    setEditCurrency(account.currency);
    setEditType(account.type);
    setEditError("");
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!id) return;
    setEditError("");
    setEditing(true);
    try {
      await updateAccount(id, editCurrency, editType);
      setEditOpen(false);
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditing(false);
    }
  };

  // --- Invite ---
  const handleInvite = async () => {
    if (!id) return;
    setInviteError("");
    setInviting(true);

    try {
      const { public_key } = await apiFetch<{ public_key: string }>(
        `${ENDPOINTS.userLookup}?email=${encodeURIComponent(inviteEmail)}`
      );

      // Reuse the existing account key if we have it, otherwise generate one
      let keyToUse = accountKeyBase64;
      if (!keyToUse) {
        keyToUse = generateAccountKey();
        // Also store it for ourselves
        const ownPubKey = currentUser?.public_key;
        if (ownPubKey) {
          const enc = await encryptAccountKeyForRecipient(keyToUse, ownPubKey);
          await apiFetch(ENDPOINTS.accountKey(id), {
            method: "PUT",
            body: JSON.stringify({
              encrypted_account_key: `${enc.ephemeralPublicKey}:${enc.ciphertext}`,
            }),
          });
          setAccountKeyBase64(keyToUse);
        }
      }

      const encrypted = await encryptAccountKeyForRecipient(keyToUse, public_key);
      const encryptedAccountKey = `${encrypted.ephemeralPublicKey}:${encrypted.ciphertext}`;

      await inviteUser(id, inviteEmail, encryptedAccountKey);
      setInviteOpen(false);
      setInviteEmail("");
    } catch (err: any) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  };

  // Category helpers
  const handleSelectCategory = (cat: string) => {
    setTxCategory(cat);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  const handleAddNewCategory = () => {
    const cat = newCategory.trim();
    if (!cat) return;
    if (id) addCategory(id, cat);
    setTxCategory(cat);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  // --- Create transaction ---
  const handleCreateTransaction = async () => {
    if (!id) return;
    if (!accountKeyBase64) {
      setTxCreateError("Account key not available. Try re-encrypting the key.");
      return;
    }
    setTxCreateError("");
    setTxCreating(true);

    try {
      const amount = parseFloat(txAmount);
      if (isNaN(amount)) {
        throw new Error("Invalid amount");
      }

      const category = txCategory || "general";
      if (id) addCategory(id, category);

      const encryptedPayload = await encryptTransactionPayload(
        { amount, category, notes: txNotes, counterparty: txCounterparty },
        accountKeyBase64
      );

      const time = new Date(txDate + "T12:00:00Z").toISOString();

      await apiFetch(ENDPOINTS.transactions(id), {
        method: "POST",
        body: JSON.stringify({
          time,
          encrypted_payload: encryptedPayload,
        } as CreateTransactionRequest),
      });

      setCreateOpen(false);
      setTxAmount("");
      setTxCategory("");
      setTxNotes("");
      setTxCounterparty("");
      setTxDate(new Date().toISOString().slice(0, 10));
      setShowCategoryInput(false);
      await fetchTransactions();
    } catch (err: any) {
      setTxCreateError(err.message);
    } finally {
      setTxCreating(false);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await apiFetch(ENDPOINTS.transaction(txId), { method: "DELETE" });
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
    } catch (err: any) {
      setTxError(err.message);
    }
  };

  if (!account) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => navigate("/accounts")}>
          &larr; Back to Accounts
        </Button>
        <p className="text-muted-foreground">Account not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/accounts")}>
            &larr;
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{account.currency}</h1>
            <p className="text-sm text-muted-foreground capitalize">{account.type} account</p>
          </div>
          <Button variant="outline" size="sm" onClick={openEdit}>
            Edit
          </Button>
        </div>
        <div className="flex gap-2">
          {/* Create Transaction */}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Add Transaction</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Transaction</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date</label>
                  <Input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  {!showCategoryInput ? (
                    <div className="flex gap-2">
                      <select
                        value={txCategory}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setShowCategoryInput(true);
                          } else {
                            setTxCategory(e.target.value);
                          }
                        }}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="">Select category...</option>
                        {id &&
                          getCategories(id).map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        <option value="__new__">+ Add new category...</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="New category name"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddNewCategory();
                          }
                        }}
                      />
                      <Button type="button" size="sm" onClick={handleAddNewCategory}>
                        Add
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCategoryInput(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Counterparty</label>
                  <Input
                    value={txCounterparty}
                    onChange={(e) => setTxCounterparty(e.target.value)}
                    placeholder="e.g. Store name, employer"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Input
                    value={txNotes}
                    onChange={(e) => setTxNotes(e.target.value)}
                    placeholder="Optional notes"
                  />
                </div>
                {txCreateError && <p className="text-sm text-destructive">{txCreateError}</p>}
                <Button onClick={handleCreateTransaction} className="w-full" disabled={txCreating}>
                  {txCreating ? "Creating..." : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Invite (for joint accounts) */}
          {account.type === "joint" && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Invite User</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite to Account</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">User Email</label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                    />
                  </div>
                  {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
                  <Button onClick={handleInvite} className="w-full" disabled={inviting}>
                    {inviting ? "Sending..." : "Send Invite"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Edit Account Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <select
                value={editCurrency}
                onChange={(e) => setEditCurrency(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.symbol} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <Button onClick={handleEdit} className="w-full" disabled={editing}>
              {editing ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Members Card */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {accountUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members.</p>
          ) : (
            <div className="space-y-2">
              {accountUsers.map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <span className="text-sm font-medium capitalize">{user.role}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {user.user_id === currentUser?.id
                        ? "(you)"
                        : `ID: ${user.user_id.slice(0, 8)}...`}
                    </span>
                  </div>
                  {user.role !== "owner" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => id && removeUser(id, user.user_id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <p className="text-sm text-muted-foreground">Loading transactions...</p>
          ) : txError ? (
            <p className="text-sm text-destructive">{txError}</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transactions yet. Click "Add Transaction" to get started. For initial balance, add an opening balance transaction.
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => {
                const p = tx.decryptedPayload;
                const isIncome = p ? p.amount >= 0 : null;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {p ? (
                        <>
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              isIncome ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {isIncome ? "+" : ""}
                            {p.amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                            {p.category}
                          </span>
                          {p.counterparty && (
                            <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                              {p.counterparty}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground">
                          {tx.encrypted_payload.slice(0, 16)}...
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(tx.time).toLocaleDateString()}
                      </span>
                      {p?.notes && (
                        <span className="text-xs text-muted-foreground truncate hidden md:inline italic">
                          {p.notes}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDeleteTransaction(tx.id)}
                    >
                      Delete
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
