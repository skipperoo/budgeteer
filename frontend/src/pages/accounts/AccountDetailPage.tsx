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
import { useCategoryStore, type CategoryType } from "@/stores/category-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { bytesToBase64, encryptAccountKeyForRecipient, generateAccountKey } from "@/lib/crypto";
import { encryptTransactionPayload, decryptTransactionPayload } from "@/lib/crypto-transaction";
import { getAccountKey } from "@/lib/decrypt-transactions";
import { TransactionCard, type TransactionDisplay } from "@/components/transactions/TransactionCard";
import { CURRENCIES, getCurrencySymbol } from "@/lib/format";
import type { Transaction, CreateTransactionRequest } from "@/types";

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
  const [editName, setEditName] = useState("");
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
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState("");

  // --- Create transaction state ---
  const [createOpen, setCreateOpen] = useState(false);
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txCounterparty, setTxCounterparty] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txCreating, setTxCreating] = useState(false);
  const [txCreateError, setTxCreateError] = useState("");

  // --- Edit transaction state ---
  const [editTxOpen, setEditTxOpen] = useState(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);
  const [editTxType, setEditTxType] = useState<"income" | "expense">("expense");
  const [editTxAmount, setEditTxAmount] = useState("");
  const [editTxCategory, setEditTxCategory] = useState("");
  const [editTxNotes, setEditTxNotes] = useState("");
  const [editTxCounterparty, setEditTxCounterparty] = useState("");
  const [editTxDate, setEditTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editTxSaving, setEditTxSaving] = useState(false);
  const [editTxError, setEditTxError] = useState("");
  const [editTxShowCategoryInput, setEditTxShowCategoryInput] = useState(false);
  const [editTxNewCategory, setEditTxNewCategory] = useState("");

  // Category combobox state
  const { getCategories, addCategory, version: _catVersion } = useCategoryStore();
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if (id) {
      fetchAccountUsers(id);
      // Fetch the account key first, then transactions (so we can decrypt)
      fetchAccountKey().then((key) => {
        fetchTransactions(key ?? undefined);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fetchAccountUsers]);

  // Fetch and decrypt the account key for this account.
  // Delegates to the shared getAccountKey which handles caching in
  // sessionStorage for page-refresh resilience.
  const fetchAccountKey = async (): Promise<string | null> => {
    if (!id) return null;
    try {
      const key = await getAccountKey(id, privKeyBase64 ?? undefined, currentUser?.public_key);
      setAccountKeyBase64(key);
      return key;
    } catch {
      return null; /* no key available */
    }
  };

  // Re-fetch accounts if we don't have this one yet
  useEffect(() => {
    if (id && !account && accounts.length === 0) {
      fetchAccounts();
    }
  }, [id, account, accounts.length, fetchAccounts]);

  const fetchTransactions = async (key?: string) => {
    if (!id) return;
    const keyToUse = key ?? accountKeyBase64;
    setTxLoading(true);
    setTxError("");
    try {
      const data = await apiFetch<Transaction[]>(ENDPOINTS.transactions(id));
      const raw = data ?? [];

      const decrypted: TransactionDisplay[] = await Promise.all(
        raw.map(async (tx) => {
          if (keyToUse) {
            try {
              const payload = await decryptTransactionPayload(
                tx.encrypted_payload,
                keyToUse
              );
              return {
                id: tx.id,
                time: tx.time,
                payload,
              };
            } catch { /* fall through: show "could not decrypt" */ }
          }
          return {
            id: tx.id,
            time: tx.time,
            payload: null,
            decryptError: keyToUse ? "Decryption failed" : "Key unavailable",
          };
        })
      );

      setTransactions(decrypted);
    } catch (err: any) {
      setTxError(err.message);
    } finally {
      setTxLoading(false);
    }
  };

  // Re-decrypt when account key changes (e.g., after invite generates a new key)
  useEffect(() => {
    if (accountKeyBase64 && transactions.length > 0) {
      fetchTransactions(accountKeyBase64);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKeyBase64]);

  // --- Edit account ---
  const openEdit = () => {
    if (!account) return;
    setEditName(account.name);
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
      await updateAccount(id, editName, editCurrency, editType);
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
      let keyToUse: string;
      if (accountKeyBase64) {
        keyToUse = accountKeyBase64;
      } else {
        // Try to get via shared utility (which checks cache & can generate)
        try {
          keyToUse = await getAccountKey(
            id,
            privKeyBase64 ?? undefined,
            currentUser?.public_key
          );
        } catch {
          keyToUse = generateAccountKey();
        }
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
    if (id) addCategory(txType as CategoryType, cat);
    setTxCategory(cat);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  // --- Edit transaction ---
  const openEditTx = (txId: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx || !tx.payload) return;
    setEditTxId(txId);
    setEditTxType(tx.payload.amount >= 0 ? "income" : "expense");
    setEditTxAmount(String(Math.abs(tx.payload.amount)));
    setEditTxCategory(tx.payload.category ?? "");
    setEditTxNotes(tx.payload.notes ?? "");
    setEditTxCounterparty(tx.payload.counterparty ?? "");
    setEditTxDate(new Date(tx.time).toISOString().slice(0, 10));
    setEditTxShowCategoryInput(false);
    setEditTxNewCategory("");
    setEditTxError("");
    setEditTxOpen(true);
  };

  const handleUpdateTransaction = async () => {
    if (!editTxId) return;
    if (!accountKeyBase64) {
      setEditTxError("Account key not available. Try re-encrypting the key.");
      return;
    }
    setEditTxError("");
    setEditTxSaving(true);

    try {
      const rawAmount = parseFloat(editTxAmount);
      if (isNaN(rawAmount)) {
        throw new Error("Invalid amount");
      }
      const amount = editTxType === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

      const category = editTxCategory || "general";
      addCategory(editTxType as CategoryType, category);

      const encryptedPayload = await encryptTransactionPayload(
        { amount, category, notes: editTxNotes, counterparty: editTxCounterparty },
        accountKeyBase64
      );

      const time = new Date(editTxDate + "T12:00:00Z").toISOString();

      await apiFetch(ENDPOINTS.transaction(editTxId), {
        method: "PUT",
        body: JSON.stringify({
          time,
          encrypted_payload: encryptedPayload,
        } as CreateTransactionRequest),
      });

      setEditTxOpen(false);
      setEditTxId(null);
      await fetchTransactions();
    } catch (err: any) {
      setEditTxError(err.message);
    } finally {
      setEditTxSaving(false);
    }
  };

  const handleEditSelectCategory = (cat: string) => {
    setEditTxCategory(cat);
    setEditTxShowCategoryInput(false);
    setEditTxNewCategory("");
  };

  const handleEditAddNewCategory = () => {
    const cat = editTxNewCategory.trim();
    if (!cat) return;
    addCategory(editTxType, cat);
    setEditTxCategory(cat);
    setEditTxShowCategoryInput(false);
    setEditTxNewCategory("");
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
      const rawAmount = parseFloat(txAmount);
      if (isNaN(rawAmount)) {
        throw new Error("Invalid amount");
      }
      // Apply sign based on income/expense toggle
      const amount = txType === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

      const category = txCategory || "general";
      addCategory(txType as CategoryType, category);

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
      setTxType("expense");
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

  const totalBalance = transactions
    .filter((tx) => tx.payload)
    .reduce((sum, tx) => sum + (tx.payload?.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/accounts")} className="h-9 w-9 p-0 shrink-0">
            &larr;
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold truncate">{account.name || account.currency}</h1>
              <Button variant="outline" size="sm" onClick={openEdit} className="h-7 px-2 text-[10px] shrink-0">
                Edit
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-lg sm:text-xl font-semibold font-mono ${
                  totalBalance < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {getCurrencySymbol(account.currency)}
                {totalBalance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground capitalize">• {account.type} account</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 self-start sm:self-auto shrink-0">
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
                  <div className="flex gap-2">
                    <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => { setTxType("expense"); setTxCategory(""); }}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          txType === "expense"
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTxType("income"); setTxCategory(""); }}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          txType === "income"
                            ? "bg-primary text-primary-foreground"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Income
                      </button>
                    </div>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
                        {txType === "expense" ? "-" : "+"}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        value={txAmount}
                        onChange={(e) => setTxAmount(e.target.value)}
                        placeholder="0.00"
                        className="pl-7"
                        required
                      />
                    </div>
                  </div>
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
                          getCategories(txType as CategoryType).map((cat) => (
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

          {/* Edit Transaction Dialog */}
          <Dialog open={editTxOpen} onOpenChange={setEditTxOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Transaction</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <div className="flex gap-2">
                    <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditTxType("expense")}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          editTxType === "expense"
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTxType("income")}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          editTxType === "income"
                            ? "bg-primary text-primary-foreground"
                            : "bg-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Income
                      </button>
                    </div>
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
                        {editTxType === "expense" ? "-" : "+"}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        value={editTxAmount}
                        onChange={(e) => setEditTxAmount(e.target.value)}
                        placeholder="0.00"
                        className="pl-7"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date</label>
                  <Input
                    type="date"
                    value={editTxDate}
                    onChange={(e) => setEditTxDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  {!editTxShowCategoryInput ? (
                    <div className="flex gap-2">
                      <select
                        value={editTxCategory}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setEditTxShowCategoryInput(true);
                          } else {
                            setEditTxCategory(e.target.value);
                          }
                        }}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="">Select category...</option>
                        {id &&
                          getCategories(editTxType as CategoryType).map((cat) => (
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
                        value={editTxNewCategory}
                        onChange={(e) => setEditTxNewCategory(e.target.value)}
                        placeholder="New category name"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleEditAddNewCategory();
                          }
                        }}
                      />
                      <Button type="button" size="sm" onClick={handleEditAddNewCategory}>
                        Add
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditTxShowCategoryInput(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Counterparty</label>
                  <Input
                    value={editTxCounterparty}
                    onChange={(e) => setEditTxCounterparty(e.target.value)}
                    placeholder="e.g. Store name, employer"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Input
                    value={editTxNotes}
                    onChange={(e) => setEditTxNotes(e.target.value)}
                    placeholder="Optional notes"
                  />
                </div>
                {editTxError && <p className="text-sm text-destructive">{editTxError}</p>}
                <Button onClick={handleUpdateTransaction} className="w-full" disabled={editTxSaving}>
                  {editTxSaving ? "Saving..." : "Save"}
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
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Account name"
              />
            </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Transactions (2/3 width on desktop) */}
        <div className="lg:col-span-2 space-y-6">
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
                  {transactions.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      currency={account.currency}
                      onDelete={handleDeleteTransaction}
                      onEdit={tx.payload ? openEditTx : undefined}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Members (1/3 width on desktop) */}
        <div className="space-y-6">
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
                      className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-medium capitalize">{user.role}</span>
                        <span className="text-muted-foreground ml-2 truncate block sm:inline">
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
                          className="h-7 px-2 text-[10px]"
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
        </div>
      </div>
    </div>
  );
}
