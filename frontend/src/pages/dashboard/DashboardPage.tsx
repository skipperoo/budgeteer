import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { bytesToBase64 } from "@/lib/crypto";
import { encryptTransactionPayload } from "@/lib/crypto-transaction";
import { fetchAndDecryptTransactions } from "@/lib/decrypt-transactions";
import type { Transaction, CreateTransactionRequest } from "@/types";
import type { DecryptedTransaction } from "@/lib/decrypt-transactions";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { accounts, fetchAccounts } = useAccountStore();
  const user = useAuthStore((s) => s.user);
  const plaintextPrivateKey = useAuthStore((s) => s.plaintextPrivateKey);
  const [loading, setLoading] = useState(true);

  // Transaction data
  const [allTxs, setAllTxs] = useState<DecryptedTransaction[]>([]);
  const [rawTxCount, setRawTxCount] = useState(0);

  // Create transaction dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txCounterparty, setTxCounterparty] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txAccountId, setTxAccountId] = useState("");
  const [txCreating, setTxCreating] = useState(false);
  const [txCreateError, setTxCreateError] = useState("");

  // Category combobox state
  const { getCategories, addCategory } = useCategoryStore();
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const privKeyBase64 = plaintextPrivateKey
    ? bytesToBase64(new Uint8Array(plaintextPrivateKey))
    : null;

  const loadData = useCallback(async () => {
    await fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  // Fetch and decrypt transactions when accounts are loaded
  useEffect(() => {
    if (!privKeyBase64 || accounts.length === 0) return;

    let total = 0;
    const allDecrypted: DecryptedTransaction[] = [];

    Promise.all(
      accounts.map(async (acc) => {
        try {
          // Get raw count first
          const raw = await apiFetch<Transaction[]>(ENDPOINTS.transactions(acc.id));
          total += (raw ?? []).length;

          // Try to decrypt
          const decrypted = await fetchAndDecryptTransactions(acc.id, privKeyBase64);
          allDecrypted.push(...decrypted);
        } catch {
          // Skip accounts we can't decrypt
        }
      })
    ).then(() => {
      setRawTxCount(total);
      allDecrypted.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setAllTxs(allDecrypted);
    });
  }, [accounts, privKeyBase64]);

  const recentTxs = allTxs.slice(0, 10);
  const avgAmount =
    allTxs.length > 0
      ? allTxs.reduce((sum, tx) => sum + Math.abs(tx.payload.amount), 0) / allTxs.length
      : 0;

  const incomeCount = allTxs.filter((tx) => tx.payload.amount > 0).length;
  const expenseCount = allTxs.filter((tx) => tx.payload.amount < 0).length;

  // Handle category selection
  const handleSelectCategory = (cat: string) => {
    setTxCategory(cat);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  const handleAddNewCategory = () => {
    const cat = newCategory.trim();
    if (!cat) return;
    if (txAccountId) addCategory(txAccountId, cat);
    setTxCategory(cat);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  // Create transaction
  const handleCreateTransaction = async () => {
    if (!txAccountId) {
      setTxCreateError("Please select an account");
      return;
    }
    setTxCreateError("");
    setTxCreating(true);

    try {
      const amount = parseFloat(txAmount);
      if (isNaN(amount)) {
        throw new Error("Invalid amount");
      }

      const accountKeyBase64 = "AAAAAAAAAAAAAAAAAAAAAA==";
      const encryptedPayload = await encryptTransactionPayload(
        { amount, category: txCategory || "general", notes: txNotes, counterparty: txCounterparty },
        accountKeyBase64
      );

      const time = new Date(txDate + "T12:00:00Z").toISOString();

      await apiFetch(ENDPOINTS.transactions(txAccountId), {
        method: "POST",
        body: JSON.stringify({ time, encrypted_payload: encryptedPayload } as CreateTransactionRequest),
      });

      setCreateOpen(false);
      setTxAmount("");
      setTxCategory("");
      setTxNotes("");
      setTxCounterparty("");
      setTxDate(new Date().toISOString().slice(0, 10));
    } catch (err: any) {
      setTxCreateError(err.message);
    } finally {
      setTxCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Transaction button */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="lg">+ New Transaction</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Transaction</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Account</label>
                <select
                  value={txAccountId}
                  onChange={(e) => {
                    setTxAccountId(e.target.value);
                    setShowCategoryInput(false);
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  required
                >
                  <option value="">Select account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.currency} ({a.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="number"
                  step="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="0.00 (negative for expense)"
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
                      {txAccountId &&
                        getCategories(txAccountId).map((cat) => (
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rawTxCount}</div>
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
              {incomeCount}
              <span className="text-sm font-normal text-muted-foreground"> / </span>
              {expenseCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allTxs.length > 0
                ? avgAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTxs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">
                No transactions yet. Add one to get started.
              </p>
              <Button
                onClick={() => {
                  if (accounts.length > 0) {
                    setTxAccountId(accounts[0].id);
                  }
                  setCreateOpen(true);
                }}
              >
                Add Transaction
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTxs.map((tx) => {
                const isIncome = tx.payload.amount >= 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/accounts/${tx.account_id}`)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          isIncome ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {isIncome ? "+" : ""}
                        {tx.payload.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                        {tx.payload.category}
                      </span>
                      {tx.payload.counterparty && (
                        <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                          {tx.payload.counterparty}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {new Date(tx.time).toLocaleDateString()}
                      </span>
                    </div>
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
