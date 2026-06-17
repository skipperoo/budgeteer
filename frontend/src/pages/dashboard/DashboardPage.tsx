import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useAccountStore } from "@/stores/account-store";
import { useAuthStore } from "@/stores/auth-store";
import { useCategoryStore, type CategoryType } from "@/stores/category-store";
import { useDateRangeStore } from "@/stores/date-range-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { bytesToBase64 } from "@/lib/crypto";
import { encryptTransactionPayload, effectiveAmount } from "@/lib/crypto-transaction";
import { encryptFile } from "@/lib/crypto-file";
import { fetchAndDecryptTransactions, getAccountKey } from "@/lib/decrypt-transactions";
import { TransactionCard } from "@/components/transactions/TransactionCard";
import { TransactionDetailOverlay } from "@/components/transactions/TransactionDetailOverlay";
import { TransactionForm, type TransactionFormData } from "@/components/transactions/TransactionForm";
import type { CreateTransactionRequest, Transaction } from "@/types";
import type { DecryptedTransaction } from "@/lib/decrypt-transactions";
import { BalanceChart } from "@/components/shared/BalanceChart";
import { BudgetProgressSection } from "@/components/shared/BudgetProgressSection";
import { getCurrencySymbol, formatCurrency } from "@/lib/format";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
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

  // Date range
  const dateRange = useDateRangeStore((s) => s.range);

  // Filter transactions to the selected date range
  const filteredTxs = allTxs.filter((tx) => {
    const d = tx.time.slice(0, 10);
    return d >= dateRange.start && d <= dateRange.end;
  });

  // No-accounts overlay
  const [noAccountsDialogOpen, setNoAccountsDialogOpen] = useState(false);

  // Create transaction dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [txCreating, setTxCreating] = useState(false);
  const [txCreateError, setTxCreateError] = useState("");

  // Transaction detail overlay state
  const [detailTx, setDetailTx] = useState<DecryptedTransaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAccountKey, setDetailAccountKey] = useState<string | null>(null);

  const { getCategories, addCategory } = useCategoryStore();

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

  // Exclude "Opening Balance" from income/expense stats (it's an accounting entry)
  const regularTxs = filteredTxs.filter((tx) => tx.payload.category !== "Opening Balance");
  const recentTxs = regularTxs.slice(0, 10);
  const currencyMap = Object.fromEntries(accounts.map((a) => [a.id, a.currency]));

  // Balance computations (within date range)
  const totalBalance = filteredTxs.reduce((sum, tx) => sum + effectiveAmount(tx.payload), 0);
  const totalIncome = regularTxs
    .filter((tx) => tx.payload.amount > 0)
    .reduce((sum, tx) => sum + effectiveAmount(tx.payload), 0);
  const totalExpenses = regularTxs
    .filter((tx) => tx.payload.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(effectiveAmount(tx.payload)), 0);
  const incomeCount = regularTxs.filter((tx) => tx.payload.amount > 0).length;
  const expenseCount = regularTxs.filter((tx) => tx.payload.amount < 0).length;

  // Average income and expense amounts
  const incomeTx = regularTxs.filter((tx) => tx.payload.amount > 0);
  const expenseTx = regularTxs.filter((tx) => tx.payload.amount < 0);
  const incomeAvg = incomeTx.length > 0
    ? incomeTx.reduce((sum, tx) => sum + effectiveAmount(tx.payload), 0) / incomeTx.length
    : 0;
  const expenseAvg = expenseTx.length > 0
    ? Math.abs(expenseTx.reduce((sum, tx) => sum + effectiveAmount(tx.payload), 0)) / expenseTx.length
    : 0;

  const defaultCurrency = localStorage.getItem("budgeteer_default_currency") || "EUR";
  const defaultSymbol = getCurrencySymbol(defaultCurrency);

  // Total net worth per currency (all-time, from all transactions)
  const netWorthByCurrency = (() => {
    const perAccount: Record<string, number> = {};
    for (const tx of allTxs) {
      if (tx.payload) {
        perAccount[tx.account_id] = (perAccount[tx.account_id] || 0) + effectiveAmount(tx.payload);
      }
    }
    const byCur: Record<string, number> = {};
    for (const acc of accounts) {
      const balance = perAccount[acc.id] || 0;
      const cur = acc.currency;
      byCur[cur] = (byCur[cur] || 0) + balance;
    }
    return byCur;
  })();

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

  // Group and compute balance over time — contiguous window from dateRange.start to dateRange.end.
  // Cumulative starts from the day before the window (using all transactions) so the trajectory
  // is a true balance, not just the net change within the window.
  const balanceChartData = (() => {
    const startDate = new Date(dateRange.start + "T12:00:00");
    const endDate = new Date(dateRange.end + "T12:00:00");

    // 1. Compute the cumulative balance up to the day BEFORE the window starts
    let openingBalance = 0;
    const windowStartEpoch = startDate.getTime();
    for (const tx of allTxs) {
      const txTime = new Date(tx.time).getTime();
      if (txTime < windowStartEpoch) {
        openingBalance += tx.payload ? effectiveAmount(tx.payload) : 0;
      }
    }

    // 2. Build a contiguous calendar for the window
    const dayTotals: Record<string, number> = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dayTotals[key] = 0;
    }

    // 3. Accumulate filtered transactions into the daily buckets
    for (const tx of filteredTxs) {
      const key = tx.time.slice(0, 10);
      if (key in dayTotals) {
        dayTotals[key] += tx.payload ? effectiveAmount(tx.payload) : 0;
      }
    }

    // 4. Compute running total starting from the opening balance
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

  // Expenses by category — excludes "Opening Balance" (it's an accounting entry, not a real expense)
  const expenseChartData = (() => {
    const categories: Record<string, number> = {};
    filteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount < 0 && tx.payload.category !== "Opening Balance") {
        const cat = tx.payload.category || "General";
        categories[cat] = (categories[cat] || 0) + Math.abs(effectiveAmount(tx.payload));
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
    filteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount > 0 && tx.payload.category !== "Opening Balance") {
        const cat = tx.payload.category || "General";
        categories[cat] = (categories[cat] || 0) + effectiveAmount(tx.payload);
      }
    });
    return Object.entries(categories)
      .map(([name, value]) => ({
        name,
        value: Number(value.toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);
  })();

  // Totals for donut center labels
  const expenseTotal = expenseChartData.reduce((sum, d) => sum + d.value, 0);
  const incomeTotal = incomeChartData.reduce((sum, d) => sum + d.value, 0);

  // Open transaction detail overlay, fetching the account key on demand
  const handleOpenDetail = useCallback(async (tx: DecryptedTransaction) => {
    setDetailTx(tx);
    setDetailOpen(true);
    try {
      const key = await getAccountKey(tx.account_id, privKeyBase64 ?? undefined, user?.public_key);
      setDetailAccountKey(key);
    } catch {
      setDetailAccountKey(null);
    }
  }, [privKeyBase64, user]);

  // Edit a transaction from the detail overlay: navigate to the account detail page
  const handleEditFromOverlay = useCallback((txId: string) => {
    if (!detailTx) return;
    navigate(`/accounts/${detailTx.account_id}`);
  }, [detailTx, navigate]);

  // Delete a transaction from the detail overlay
  const handleDeleteFromOverlay = useCallback(async (txId: string) => {
    if (!detailTx) return;
    try {
      await apiFetch(ENDPOINTS.transaction(txId), { method: "DELETE" });
      setDetailOpen(false);
      setDetailTx(null);
      setDetailAccountKey(null);
      refreshTransactions();
    } catch {
      // Error handled silently — the overlay will still close
    }
  }, [detailTx, refreshTransactions]);

  // Create transaction (called by TransactionForm on submit)
  const handleCreateTransaction = async (data: TransactionFormData) => {
    setTxCreateError("");
    setTxCreating(true);

    try {
      const rawAmount = parseFloat(data.amount);
      if (isNaN(rawAmount)) throw new Error("Invalid amount");
      const amount = data.type === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
      const commission = data.commission ? parseFloat(data.commission) : 0;

      const accountKeyBase64 = await getAccountKey(
        data.accountId,
        privKeyBase64 ?? undefined,
        user?.public_key
      );

      const category = data.category || "general";
      addCategory(data.type as CategoryType, category);

      const encryptedPayload = await encryptTransactionPayload(
        { amount, category, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined },
        accountKeyBase64
      );

      const time = new Date(data.date + "T12:00:00Z").toISOString();

      const createdTx = await apiFetch<Transaction>(ENDPOINTS.transactions(data.accountId), {
        method: "POST",
        body: JSON.stringify({ time, encrypted_payload: encryptedPayload } as CreateTransactionRequest),
      });

      // Upload document if provided
      if (data.file && createdTx?.id) {
        const fileData = await encryptFile(data.file, accountKeyBase64);
        await apiFetch(ENDPOINTS.transactionDocuments(createdTx.id), {
          method: "POST",
          body: JSON.stringify(fileData),
        });
      }

      setCreateOpen(false);
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
    <div className="space-y-3">
      {/* Header with Add Transaction button */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        {accounts.length > 0 ? (
          <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="New Transaction" trigger={<Button size="lg">+ New Transaction</Button>}>
            <TransactionForm
              accounts={accounts.map((a) => ({ id: a.id, label: `${a.name || a.currency} (${a.type})` }))}
              getCategories={getCategories}
              addCategory={addCategory}
              onSave={handleCreateTransaction}
              saving={txCreating}
              error={txCreateError}
            />
        </ResponsiveDialog>
        ) : (
          <>
            <Button size="lg" onClick={() => setNoAccountsDialogOpen(true)}>
              + New Transaction
            </Button>
            <ResponsiveDialog open={noAccountsDialogOpen} onOpenChange={setNoAccountsDialogOpen} title="No Accounts Yet">
              <div className="space-y-4 text-center py-4">
                <p className="text-sm text-muted-foreground">
                  You need at least one account before you can add a transaction.
                </p>
                <Button onClick={() => { setNoAccountsDialogOpen(false); navigate("/accounts", { state: { openCreate: true } }); }}>
                  Create an Account
                </Button>
              </div>
            </ResponsiveDialog>
          </>
        )}
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
              Money Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Income</span>
                <span className="font-semibold tabular-nums text-income">
                  {formatCurrency(totalIncome, defaultCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expenses</span>
                <span className="font-semibold tabular-nums text-expense">
                  -{formatCurrency(totalExpenses, defaultCurrency)}
                </span>
              </div>
              <div className="border-t border-border pt-1 mt-1 flex items-center justify-between text-sm font-bold">
                <span>Net</span>
                <span className={`tabular-nums ${totalIncome - totalExpenses >= 0 ? "text-income" : "text-expense"}`}>
                  {formatCurrency(totalIncome - totalExpenses, defaultCurrency, true)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: All Assets chart + Recent Transactions side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left column: All Assets chart (2/3) */}
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-[400px]">
            <CardHeader className="pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">All Assets</CardTitle>
                <div className="flex items-center gap-3 text-sm font-medium">
                  {Object.entries(netWorthByCurrency).map(([cur, val]) => (
                    <span
                      key={cur}
                      className={`tabular-nums font-semibold ${
                        val < 0 ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {getCurrencySymbol(cur)}
                      {val.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <BalanceChart
                data={balanceChartData}
                currency={defaultCurrency}
                gradientId="colorAllAssets"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column: Recent Transactions (1/3) */}
        <div>
          <Card className="flex flex-col h-[400px]">
            <CardHeader className="shrink-0">
              <CardTitle className="text-lg font-bold">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto">
              {recentTxs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[260px] text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    No transactions yet. Add one to get started.
                  </p>
                  <Button
                    onClick={() => {
                      if (accounts.length === 0) {
                        setNoAccountsDialogOpen(true);
                      } else {
                        setCreateOpen(true);
                      }
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
                      onClick={() => handleOpenDetail(tx)}
                      compact
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Transaction detail overlay */}
      {detailTx?.payload && (
        <TransactionDetailOverlay
          transaction={{ id: detailTx.id, time: detailTx.time, payload: detailTx.payload }}
          currency={currencyMap[detailTx.account_id] || defaultCurrency}
          accountKeyBase64={detailAccountKey}
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) {
              setDetailTx(null);
              setDetailAccountKey(null);
            }
          }}
          onEdit={(txId) => {
            setDetailOpen(false);
            handleEditFromOverlay(txId);
          }}
          onDelete={(txId) => {
            setDetailOpen(false);
            handleDeleteFromOverlay(txId);
          }}
        />
      )}

      {/* Budget Progress Section */}
      <BudgetProgressSection transactions={filteredTxs} />

      {/* Pie charts: side by side below the main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      <text
                        x="50%"
                        y="50%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-destructive"
                        style={{ fontSize: 14, fontWeight: 700, fontFamily: "DM Sans, system-ui, sans-serif" }}
                      >
                        {defaultSymbol}
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
                      <text
                        x="50%"
                        y="50%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-income"
                        style={{ fontSize: 14, fontWeight: 700, fontFamily: "DM Sans, system-ui, sans-serif" }}
                      >
                        {defaultSymbol}
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
  );
}
