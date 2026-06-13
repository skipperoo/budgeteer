import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAccountStore } from "@/stores/account-store";
import { useAuthStore } from "@/stores/auth-store";
import { useCategoryStore, type CategoryType } from "@/stores/category-store";
import { useDateRangeStore } from "@/stores/date-range-store";
import { BalanceChart } from "@/components/shared/BalanceChart";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { bytesToBase64, encryptAccountKeyForRecipient } from "@/lib/crypto";
import { encryptTransactionPayload, decryptTransactionPayload } from "@/lib/crypto-transaction";
import { encryptFile } from "@/lib/crypto-file";
import { getAccountKey } from "@/lib/decrypt-transactions";
import { TransactionCard, type TransactionDisplay } from "@/components/transactions/TransactionCard";
import { TransactionDetailOverlay } from "@/components/transactions/TransactionDetailOverlay";
import { CURRENCIES, getCurrencySymbol, formatCurrency } from "@/lib/format";
import type { Transaction, CreateTransactionRequest, DocumentMetadata } from "@/types";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
} from "recharts";

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

  // --- Detail overlay state ---
  const [detailTx, setDetailTx] = useState<TransactionDisplay | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // --- File upload state (create) ---
  const [txFile, setTxFile] = useState<File | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);

  // --- File upload state (edit) ---
  const [editTxFile, setEditTxFile] = useState<File | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  // --- File input error state (debug: show file input errors) ---
  const [fileInputError, setFileInputError] = useState("");

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

      // Reuse the existing account key if we have it
      let keyToUse: string;
      if (accountKeyBase64) {
        keyToUse = accountKeyBase64;
      } else {
        // Fetch the account key via shared utility (checks cache, sessionStorage,
        // or decrypts the server-side entry). This will throw if the key cannot
        // be retrieved (e.g. missing private key or no matching entry).
        keyToUse = await getAccountKey(
          id,
          privKeyBase64 ?? undefined,
          currentUser?.public_key
        );
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

      // If a new file was selected, delete old documents and upload new one
      if (editTxFile && accountKeyBase64) {
        // First, delete any existing documents for this transaction
        const existingDocs = await apiFetch<DocumentMetadata[]>(
          ENDPOINTS.transactionDocuments(editTxId),
        );
        if (existingDocs) {
          await Promise.all(
            existingDocs.map((doc) =>
              apiFetch(ENDPOINTS.transactionDocument(editTxId, doc.id), {
                method: "DELETE",
              }),
            ),
          );
        }
        // Upload the new file
        const fileData = await encryptFile(editTxFile, accountKeyBase64);
        await apiFetch(ENDPOINTS.transactionDocuments(editTxId), {
          method: "POST",
          body: JSON.stringify(fileData),
        });
      }

      setEditTxOpen(false);
      setEditTxId(null);
      setEditTxFile(null);
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

      // Create the transaction first
      const createdTx = await apiFetch<Transaction>(ENDPOINTS.transactions(id), {
        method: "POST",
        body: JSON.stringify({
          time,
          encrypted_payload: encryptedPayload,
        } as CreateTransactionRequest),
      });

      // If there's a file, encrypt and upload as a document
      if (txFile && createdTx?.id) {
        const fileData = await encryptFile(txFile, accountKeyBase64);
        await apiFetch(ENDPOINTS.transactionDocuments(createdTx.id), {
          method: "POST",
          body: JSON.stringify(fileData),
        });
      }

      setCreateOpen(false);
      setTxType("expense");
      setTxAmount("");
      setTxCategory("");
      setTxNotes("");
      setTxCounterparty("");
      setTxDate(new Date().toISOString().slice(0, 10));
      setTxFile(null);
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

  // Date range
  const dateRange = useDateRangeStore((s) => s.range);

  // All-time balance for this account
  const totalBalance = transactions
    .filter((tx) => tx.payload)
    .reduce((sum, tx) => sum + (tx.payload?.amount || 0), 0);

  // Filter transactions to the date range for the chart and list
  const filteredTxs = transactions.filter((tx) => {
    const d = tx.time.slice(0, 10);
    return d >= dateRange.start && d <= dateRange.end;
  });

  // Pastel chart colors (matches dashboard)
  const CHART_COLORS = [
    "oklch(0.75 0.12 140)",
    "oklch(0.78 0.10 220)",
    "oklch(0.76 0.10 280)",
    "oklch(0.80 0.09 40)",
    "oklch(0.74 0.12 320)",
    "oklch(0.77 0.08 100)",
    "oklch(0.72 0.10 180)",
    "oklch(0.76 0.11 10)",
  ];

  // Expenses by category for this account (within date range)
  const expenseChartData = (() => {
    const categories: Record<string, number> = {};
    filteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount < 0 && tx.payload.category !== "Opening Balance") {
        const cat = tx.payload.category || "General";
        categories[cat] = (categories[cat] || 0) + Math.abs(tx.payload.amount);
      }
    });
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  })();

  // Income by category for this account (within date range)
  const incomeChartData = (() => {
    const categories: Record<string, number> = {};
    filteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount > 0 && tx.payload.category !== "Opening Balance") {
        const cat = tx.payload.category || "General";
        categories[cat] = (categories[cat] || 0) + tx.payload.amount;
      }
    });
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  })();

  // Totals for donut center labels
  const expenseTotal = expenseChartData.reduce((sum, d) => sum + d.value, 0);
  const incomeTotal = incomeChartData.reduce((sum, d) => sum + d.value, 0);

  // Balance chart data for this account, scoped to the date range
  const accountChartData = (() => {
    const startDate = new Date(dateRange.start + "T12:00:00");
    const endDate = new Date(dateRange.end + "T12:00:00");

    // Opening balance: sum of all transactions before the window
    let openingBalance = 0;
    const windowStartEpoch = startDate.getTime();
    for (const tx of transactions) {
      if (new Date(tx.time).getTime() < windowStartEpoch && tx.payload) {
        openingBalance += tx.payload.amount;
      }
    }

    // Build contiguous calendar
    const dayTotals: Record<string, number> = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dayTotals[d.toISOString().slice(0, 10)] = 0;
    }

    // Accumulate filtered transactions into daily buckets
    for (const tx of filteredTxs) {
      const key = tx.time.slice(0, 10);
      if (key in dayTotals && tx.payload) {
        dayTotals[key] += tx.payload.amount;
      }
    }

    // Running total
    const sortedDates = Object.keys(dayTotals).sort();
    let cumulative = openingBalance;
    return sortedDates.map((date) => {
      cumulative += dayTotals[date];
      return {
        date,
        displayDate: new Date(date + "T12:00:00Z").toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        balance: Number(cumulative.toFixed(2)),
      };
    });
  })();

  // Summary stats for dashboard-like layout
  const incomeTx = filteredTxs.filter((tx) => tx.payload && tx.payload.amount > 0);
  const expenseTxFromFiltered = filteredTxs.filter((tx) => tx.payload && tx.payload.amount < 0);
  const incomeCountAcc = incomeTx.length;
  const expenseCountAcc = expenseTxFromFiltered.length;
  const incomeAvgAcc = incomeTx.length > 0
    ? incomeTx.reduce((sum, tx) => sum + (tx.payload?.amount ?? 0), 0) / incomeTx.length
    : 0;
  const expenseAvgAcc = expenseTxFromFiltered.length > 0
    ? Math.abs(expenseTxFromFiltered.reduce((sum, tx) => sum + (tx.payload?.amount ?? 0), 0)) / expenseTxFromFiltered.length
    : 0;
  const recentAccountTxs = filteredTxs.slice(0, 10);

  return (
    <div className="space-y-3">
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
          <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="New Transaction" trigger={<Button>Add Transaction</Button>}>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Receipt / Document</label>
                  <Input
                    ref={createFileRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      try {
                        const file = e.target.files?.[0] ?? null;
                        setTxFile(file);
                        setFileInputError("");
                      } catch (err: any) {
                        setFileInputError(err?.message ?? String(err));
                      }
                    }}
                  />
                  {txFile && (
                    <p className="text-xs text-muted-foreground">
                      {txFile.name} ({(txFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                  {fileInputError && (
                    <p className="text-xs text-destructive">{fileInputError}</p>
                  )}
                </div>
                {txCreateError && <p className="text-sm text-destructive">{txCreateError}</p>}
                <Button onClick={handleCreateTransaction} className="w-full" disabled={txCreating}>
                  {txCreating ? "Creating..." : "Create"}
                </Button>
              </div>
          </ResponsiveDialog>

          {/* Edit Transaction Dialog */}
          <ResponsiveDialog open={editTxOpen} onOpenChange={setEditTxOpen} title="Edit Transaction">
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Receipt / Document</label>
                  <Input
                    ref={editFileRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      try {
                        const file = e.target.files?.[0] ?? null;
                        setEditTxFile(file);
                        setFileInputError("");
                      } catch (err: any) {
                        setFileInputError(err?.message ?? String(err));
                      }
                    }}
                  />
                  {editTxFile && (
                    <p className="text-xs text-muted-foreground">
                      {editTxFile.name} ({(editTxFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                  {fileInputError && (
                    <p className="text-xs text-destructive">{fileInputError}</p>
                  )}
                </div>
                {editTxError && <p className="text-sm text-destructive">{editTxError}</p>}
                <Button onClick={handleUpdateTransaction} className="w-full" disabled={editTxSaving}>
                  {editTxSaving ? "Saving..." : "Save"}
                </Button>
              </div>
          </ResponsiveDialog>

          {/* Invite (for joint accounts) */}
          {account.type === "joint" && (
            <ResponsiveDialog open={inviteOpen} onOpenChange={setInviteOpen} title="Invite to Account" trigger={<Button variant="outline">Invite User</Button>}>
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
            </ResponsiveDialog>
          )}
        </div>
      </div>

      {/* Edit Account Dialog */}
      <ResponsiveDialog open={editOpen} onOpenChange={setEditOpen} title="Edit Account">
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
      </ResponsiveDialog>

      {/* Transaction Detail Overlay */}
      {detailTx?.payload && (
        <TransactionDetailOverlay
          transaction={{ id: detailTx.id, time: detailTx.time, payload: detailTx.payload }}
          currency={account.currency}
          accountKeyBase64={accountKeyBase64}
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) setDetailTx(null);
          }}
          onEdit={(txId) => {
            setDetailOpen(false);
            openEditTx(txId);
          }}
          onDelete={(txId) => {
            setDetailOpen(false);
            handleDeleteTransaction(txId);
          }}
        />
      )}

      {/* Summary cards (dashboard-style, no Total Accounts) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredTxs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Income / Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {incomeCountAcc}
              <span className="text-sm font-normal text-muted-foreground"> / </span>
              {expenseCountAcc}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Tx Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredTxs.length > 0 ? (
              <div className="flex flex-row gap-0.5">
                <span className="text-income text-sm font-semibold tabular-nums">
                  {formatCurrency(incomeAvgAcc, account.currency)}
                </span>
                <span className="text-sm font-bold">/</span>
                <span className="text-expense text-sm font-semibold tabular-nums">
                  {formatCurrency(expenseAvgAcc, account.currency)}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Balance chart + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <Card className="flex flex-col min-h-full">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-lg font-bold">Balance</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <div className="h-full w-full">
                <BalanceChart
                  data={accountChartData}
                  currency={account.currency}
                  gradientId="colorAccountBalance"
                />
              </div>
            </CardContent>
          </Card>
        </div>
        <div>
          <Card className="flex flex-col min-h-full">
            <CardHeader className="shrink-0">
              <CardTitle className="text-lg font-bold">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto">
              {txLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : recentAccountTxs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[260px] text-center">
                  <p className="text-sm text-muted-foreground">
                    {transactions.length === 0
                      ? `No transactions yet. Click "Add Transaction" to get started.`
                      : "No transactions in selected range."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentAccountTxs.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      currency={account.currency}
                      onClick={
                        tx.payload
                          ? () => {
                              setDetailTx(tx);
                              setDetailOpen(true);
                            }
                          : undefined
                      }
                      compact
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Members for joint accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* If joint: Members card */}
        {account.type === "joint" && (
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
        )}
      </div>

      {/* Pie charts side by side (for non-joint accounts) */}
      {account.type !== "joint" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {expenseChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No expense data.
                </div>
              ) : (
                <div className="h-64 w-full flex flex-col justify-between font-mono text-[10px]">
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {expenseChartData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="none" />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-card text-card-foreground border border-border p-3 rounded-lg shadow-md text-xs">
                                  <p className="font-semibold mb-1">{data.name}</p>
                                  <p className="font-mono text-destructive font-bold">
                                    {getCurrencySymbol(account.currency)}
                                    {data.value.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <text
                          x="50%"
                          y="50%"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-destructive"
                          style={{ fontSize: 14, fontWeight: 700, fontFamily: "DM Sans, system-ui, sans-serif" }}
                        >
                          {getCurrencySymbol(account.currency)}
                          {expenseTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </text>
                        <text
                          x="50%"
                          y="50%"
                          dy={16}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-muted-foreground"
                          style={{ fontSize: 9, fontWeight: 500, fontFamily: "DM Sans, system-ui, sans-serif" }}
                        >
                          expenses
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 text-xs font-sans text-muted-foreground font-medium">
                    {expenseChartData.slice(0, 5).map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="truncate max-w-[80px]">{entry.name}</span>
                      </div>
                    ))}
                    {expenseChartData.length > 5 && (
                      <span className="text-muted-foreground italic text-[11px] self-center">+{expenseChartData.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Income by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {incomeChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No income data.
                </div>
              ) : (
                <div className="h-64 w-full flex flex-col justify-between font-mono text-[10px]">
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={incomeChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {incomeChartData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="none" />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-card text-card-foreground border border-border p-3 rounded-lg shadow-md text-xs">
                                  <p className="font-semibold mb-1">{data.name}</p>
                                  <p className="font-mono text-income font-bold">
                                    {getCurrencySymbol(account.currency)}
                                    {data.value.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <text
                          x="50%"
                          y="50%"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-income"
                          style={{ fontSize: 14, fontWeight: 700, fontFamily: "DM Sans, system-ui, sans-serif" }}
                        >
                          {getCurrencySymbol(account.currency)}
                          {incomeTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </text>
                        <text
                          x="50%"
                          y="50%"
                          dy={16}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-muted-foreground"
                          style={{ fontSize: 9, fontWeight: 500, fontFamily: "DM Sans, system-ui, sans-serif" }}
                        >
                          income
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 text-xs font-sans text-muted-foreground font-medium">
                    {incomeChartData.slice(0, 5).map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="truncate max-w-[80px]">{entry.name}</span>
                      </div>
                    ))}
                    {incomeChartData.length > 5 && (
                      <span className="text-muted-foreground italic text-[11px] self-center">+{incomeChartData.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      </div>
  );
}
