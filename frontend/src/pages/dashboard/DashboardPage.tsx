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
import { useCategoryStore, type CategoryType } from "@/stores/category-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { bytesToBase64 } from "@/lib/crypto";
import { encryptTransactionPayload } from "@/lib/crypto-transaction";
import { fetchAndDecryptTransactions, getAccountKey } from "@/lib/decrypt-transactions";
import { TransactionCard } from "@/components/transactions/TransactionCard";
import type { CreateTransactionRequest } from "@/types";
import type { DecryptedTransaction } from "@/lib/decrypt-transactions";
import { getCurrencySymbol, formatCurrency } from "@/lib/format";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

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
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txCounterparty, setTxCounterparty] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txAccountId, setTxAccountId] = useState("");
  const [txCreating, setTxCreating] = useState(false);
  const [txCreateError, setTxCreateError] = useState("");

  // Category combobox state
  const { getCategories, addCategory, version: _catVersion } = useCategoryStore();
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
  const refreshTransactions = useCallback(async () => {
    if (accounts.length === 0) return;

    let accountCounts = 0;
    const allDecrypted: DecryptedTransaction[] = [];

    await Promise.all(
      accounts.map(async (acc) => {
        try {
          const decrypted = await fetchAndDecryptTransactions(
            acc.id,
            privKeyBase64 ?? undefined,
            user?.public_key
          );
          allDecrypted.push(...decrypted);
          accountCounts += decrypted.length;
        } catch {
          // Skip accounts we can't decrypt
        }
      })
    );

    setRawTxCount(accountCounts);
    allDecrypted.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    setAllTxs(allDecrypted);
  }, [accounts, privKeyBase64, user]);

  useEffect(() => {
    refreshTransactions();
  }, [refreshTransactions]);

  const recentTxs = allTxs.slice(0, 10);
  const currencyMap = Object.fromEntries(accounts.map((a) => [a.id, a.currency]));

  // Balance computations
  const totalBalance = allTxs.reduce((sum, tx) => sum + tx.payload.amount, 0);
  const totalIncome = allTxs
    .filter((tx) => tx.payload.amount > 0)
    .reduce((sum, tx) => sum + tx.payload.amount, 0);
  const totalExpenses = allTxs
    .filter((tx) => tx.payload.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.payload.amount), 0);
  const incomeCount = allTxs.filter((tx) => tx.payload.amount > 0).length;
  const expenseCount = allTxs.filter((tx) => tx.payload.amount < 0).length;
  const avgAmount = allTxs.length > 0 ? totalBalance / allTxs.length : 0;

  const defaultCurrency = localStorage.getItem("budgeteer_default_currency") || "EUR";
  const defaultSymbol = getCurrencySymbol(defaultCurrency);

  // Pastel chart colors — light chroma, high lightness for a soft, harmonious look
  const CHART_COLORS = [
    "oklch(0.75 0.12 140)",  // Pastel green/teal
    "oklch(0.78 0.10 220)",  // Pastel blue
    "oklch(0.76 0.10 280)",  // Pastel purple
    "oklch(0.80 0.09 40)",   // Pastel ochre
    "oklch(0.74 0.12 320)",  // Pastel rose
    "oklch(0.77 0.08 100)",  // Pastel sage
    "oklch(0.72 0.10 180)",  // Pastel ocean
    "oklch(0.76 0.11 10)",   // Pastel coral
  ];

  // Group and compute balance over time
  const balanceChartData = (() => {
    if (allTxs.length === 0) return [];
    
    // Sort ascending by time
    const sorted = [...allTxs]
      .filter((t) => t.payload)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      
    // Compute running total grouped by day
    const dailyTotals: Record<string, number> = {};
    sorted.forEach((tx) => {
      const dateStr = tx.time.slice(0, 10);
      dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + tx.payload.amount;
    });
    
    const sortedDates = Object.keys(dailyTotals).sort();
    let cumulative = 0;
    return sortedDates.map((date) => {
      cumulative += dailyTotals[date];
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

  // Expenses by category — excludes "Opening Balance" (it's an accounting entry, not a real expense)
  const expenseChartData = (() => {
    const categories: Record<string, number> = {};
    allTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount < 0 && tx.payload.category !== "Opening Balance") {
        const cat = tx.payload.category || "General";
        categories[cat] = (categories[cat] || 0) + Math.abs(tx.payload.amount);
      }
    });
    return Object.entries(categories)
      .map(([name, value]) => ({
        name,
        value: Number(value.toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);
  })();

  // Income by category — excludes "Opening Balance" (it's an accounting entry, not real income)
  const incomeChartData = (() => {
    const categories: Record<string, number> = {};
    allTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount > 0 && tx.payload.category !== "Opening Balance") {
        const cat = tx.payload.category || "General";
        categories[cat] = (categories[cat] || 0) + tx.payload.amount;
      }
    });
    return Object.entries(categories)
      .map(([name, value]) => ({
        name,
        value: Number(value.toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);
  })();

  // Handle category selection
  const handleSelectCategory = (cat: string) => {
    setTxCategory(cat);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  const handleAddNewCategory = () => {
    const cat = newCategory.trim();
    if (!cat) return;
    addCategory(txType as CategoryType, cat);
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
      const rawAmount = parseFloat(txAmount);
      if (isNaN(rawAmount)) {
        throw new Error("Invalid amount");
      }
      // Apply sign based on income/expense toggle
      const amount = txType === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

      // Fetch (or retrieve from cache) the account key for the selected account.
      // getAccountKey now checks sessionStorage first, so it can work even
      // after a page refresh (when the in-memory private key is gone).
      const accountKeyBase64 = await getAccountKey(
        txAccountId,
        privKeyBase64 ?? undefined,
        user?.public_key
      );

      const category = txCategory || "general";
      addCategory(txType as CategoryType, category);

      const encryptedPayload = await encryptTransactionPayload(
        { amount, category, notes: txNotes, counterparty: txCounterparty },
        accountKeyBase64
      );

      const time = new Date(txDate + "T12:00:00Z").toISOString();

      await apiFetch(ENDPOINTS.transactions(txAccountId), {
        method: "POST",
        body: JSON.stringify({ time, encrypted_payload: encryptedPayload } as CreateTransactionRequest),
      });

      setCreateOpen(false);
      setTxType("expense");
      setTxAmount("");
      setTxCategory("");
      setTxNotes("");
      setTxCounterparty("");
      setTxDate(new Date().toISOString().slice(0, 10));
      setShowCategoryInput(false);
      refreshTransactions();
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
                      {a.name || a.currency} ({a.type})
                    </option>
                  ))}
                </select>
              </div>
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
                      {txAccountId &&
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
                ? formatCurrency(avgAmount, defaultCurrency)
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: charts and recent movements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Balance Chart and Recent Transactions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Balance Chart Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Balance Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {balanceChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No balance data available yet.
                </div>
              ) : (
                <div className="h-64 sm:h-80 w-full font-mono text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={balanceChartData}>
                      <defs>
                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                      <XAxis
                        dataKey="displayDate"
                        stroke="var(--color-muted-foreground)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                      />
                      <YAxis
                        stroke="var(--color-muted-foreground)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${defaultSymbol}${value}`}
                        dx={-5}
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-card text-card-foreground border border-border p-3 rounded-lg shadow-md text-xs">
                                <p className="font-semibold mb-1">{data.displayDate}</p>
                                <p className="font-mono text-foreground font-bold">
                                  {defaultSymbol}
                                  {Number(payload[0].value ?? 0).toLocaleString(undefined, {
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
                      <Area
                        type="monotone"
                        dataKey="balance"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorBalance)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Transactions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold">Recent Transactions</CardTitle>
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
                  {recentTxs.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={{
                        id: tx.id,
                        time: tx.time,
                        payload: tx.payload,
                      }}
                      currency={currencyMap[tx.account_id]}
                      onClick={() => navigate(`/accounts/${tx.account_id}`)}
                      compact
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Distribution Charts */}
        <div className="space-y-6">
          {/* Expenses Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {expenseChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No expense data available.
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
                                    {defaultSymbol}
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
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Custom Legend to fit nicely and avoid text overflow */}
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 text-xs font-sans text-muted-foreground font-medium">
                    {expenseChartData.slice(0, 5).map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="truncate max-w-[80px]">{entry.name}</span>
                      </div>
                    ))}
                    {expenseChartData.length > 5 && (
                      <div className="text-muted-foreground italic text-[11px] self-center">
                        +{expenseChartData.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Income Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Income by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {incomeChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No income data available.
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
                                    {defaultSymbol}
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
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Custom Legend to fit nicely and avoid text overflow */}
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 text-xs font-sans text-muted-foreground font-medium">
                    {incomeChartData.slice(0, 5).map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="truncate max-w-[80px]">{entry.name}</span>
                      </div>
                    ))}
                    {incomeChartData.length > 5 && (
                      <div className="text-muted-foreground italic text-[11px] self-center">
                        +{incomeChartData.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
