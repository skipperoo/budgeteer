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
import { encryptTransactionPayload, effectiveAmount, isTransferPayload, transactionMonthEnd, previousMonthEnd } from "@/lib/crypto-transaction";
import { encryptFile } from "@/lib/crypto-file";
import { encryptForRecipient } from "@/lib/crypto-rules";
import { fetchAndDecryptTransactions, getAccountKey, decryptTx } from "@/lib/decrypt-transactions";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useFilterStore } from "@/stores/filter-store";
import { TransactionCard } from "@/components/transactions/TransactionCard";
import { TransactionDetailOverlay } from "@/components/transactions/TransactionDetailOverlay";
import { TransactionForm, type TransactionFormData } from "@/components/transactions/TransactionForm";
import type { CreateTransactionRequest, Transaction } from "@/types";
import type { DecryptedTransaction } from "@/lib/decrypt-transactions";
import { BalanceChart } from "@/components/shared/BalanceChart";
import { BudgetProgressSection } from "@/components/shared/BudgetProgressSection";
import { getCurrencySymbol, formatCurrency, formatNumber, formatDate, parseLocaleNumber } from "@/lib/format";
import { CategoryPieChart } from "@/components/shared/CategoryPieChart";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { accounts, fetchAccounts } = useAccountStore();
  const user = useAuthStore((s) => s.user);
  const plaintextPrivateKey = useAuthStore((s) => s.plaintextPrivateKey);
  const [loading, setLoading] = useState(true);

  // Transaction data
  const [allTxs, setAllTxs] = useState<DecryptedTransaction[]>([]);
  const [rawTxCount, setRawTxCount] = useState(0);

  // Date range (affects all components)
  const dateRange = useDateRangeStore((s) => s.range);
  const { selectedCategories, selectedTypes } = useFilterStore();

  // Date-range-only filter (used for stats: counts, money flow, balance chart)
  const filteredTxs = allTxs.filter((tx) => {
    const d = tx.time.slice(0, 10);
    return d >= dateRange.start && d <= dateRange.end;
  });

  // Display filter: date range + category + type (used for pie charts and transaction lists)
  const displayFilteredTxs = filteredTxs.filter((tx) => {
    if (!tx.payload) return true;
    // Type filter
    if (selectedTypes.length > 0) {
      const isTransfer = isTransferPayload(tx.payload);
      const txType = isTransfer ? "transfer" : tx.payload.amount > 0 ? "income" : "expense";
      if (!selectedTypes.includes(txType)) return false;
    }
    // Category filter
    if (selectedCategories.length > 0) {
      if (!selectedCategories.includes(tx.payload.category)) return false;
    }
    return true;
  });

  // No-accounts overlay
  const [noAccountsDialogOpen, setNoAccountsDialogOpen] = useState(false);

  // Create transaction dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [txCreating, setTxCreating] = useState(false);
  const [txCreateError, setTxCreateError] = useState("");

  // Edit transaction dialog state
  const [editTx, setEditTx] = useState<DecryptedTransaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [txUpdating, setTxUpdating] = useState(false);
  const [txUpdateError, setTxUpdateError] = useState("");

  // Transaction detail overlay state
  const [detailTx, setDetailTx] = useState<DecryptedTransaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAccountKey, setDetailAccountKey] = useState<string | null>(null);

  // Show All transactions overlay state (dashboard-wide, across all accounts)
  const [showAllOpen, setShowAllOpen] = useState(false);

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

  // Fetch and decrypt transactions when accounts are loaded.
  // When ALL accounts have checkpoints loaded, only the active window is
  // downloaded (balances for closed months come from checkpoints).
  // Otherwise, fall back to downloading ALL transactions (pre-migration).
  const refreshTransactions = useCallback(async () => {
    if (accounts.length === 0) return;

    // First, load checkpoints for all accounts to determine the mode.
    await Promise.all(
      accounts.map((acc) =>
        useCheckpointStore.getState().loadCheckpoints(acc.id).catch(() => {}),
      ),
    );
    const allHaveCkpts = accounts.every(
      (acc) => useCheckpointStore.getState().getEntries(acc.id).length > 0,
    );

    let allDecrypted: DecryptedTransaction[] = [];

    if (allHaveCkpts) {
      // Checkpoint path: download only the active window (§5.2).
      const winStart = dateRange.start;
      const fromIso = new Date(winStart + "T00:00:00.000Z").toISOString();
      const toIso = new Date(dateRange.end + "T23:59:59.999Z").toISOString();

      await Promise.all(
        accounts.map(async (acc) => {
          try {
            let offset = 0;
            const PAGE = 200;
            const key = await getAccountKey(acc.id, privKeyBase64 ?? undefined, user?.public_key);
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const page = await apiFetch<Transaction[]>(
                `${ENDPOINTS.transactions(acc.id)}?limit=${PAGE}&offset=${offset}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
              );
              if (!page || page.length === 0) break;
              const results = await Promise.all(
                page.map((tx) => decryptTx(tx, key, privKeyBase64 ?? undefined)),
              );
              for (const r of results) {
                if (r.payload) {
                  allDecrypted.push({
                    id: r.id,
                    time: r.time,
                    account_id: r.account_id,
                    created_by: r.created_by,
                    payload: r.payload,
                  });
                }
              }
              if (page.length < PAGE) break;
              offset += PAGE;
            }
          } catch {
            // Skip accounts we can't decrypt
          }
        }),
      );
    } else {
      // Classic path: download ALL transactions (paginated) when checkpoints
      // aren't yet available (pre-migration accounts).
      await Promise.all(
        accounts.map(async (acc) => {
          try {
            const key = await getAccountKey(acc.id, privKeyBase64 ?? undefined, user?.public_key);
            let offset = 0;
            const PAGE = 200;
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const page = await apiFetch<Transaction[]>(
                `${ENDPOINTS.transactions(acc.id)}?limit=${PAGE}&offset=${offset}`,
              );
              if (!page || page.length === 0) break;
              const results = await Promise.all(
                page.map((tx) => decryptTx(tx, key, privKeyBase64 ?? undefined)),
              );
              for (const r of results) {
                if (r.payload) {
                  allDecrypted.push({
                    id: r.id,
                    time: r.time,
                    account_id: r.account_id,
                    created_by: r.created_by,
                    payload: r.payload,
                  });
                }
              }
              if (page.length < PAGE) break;
              offset += PAGE;
            }
          } catch {
            // Skip accounts we can't decrypt
          }
        }),
      );
    }

    const nonTransferCount = allDecrypted.filter(
      (tx) => tx.payload && !isTransferPayload(tx.payload)
    ).length;
    setRawTxCount(nonTransferCount);
    allDecrypted.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    setAllTxs(allDecrypted);
  }, [accounts, privKeyBase64, user, dateRange.start, dateRange.end]);

  useEffect(() => {
    refreshTransactions();
  }, [refreshTransactions]);

  // Regular transactions: exclude transfers only (opening balance is no
  // longer a transaction after migration).
  const regularTxs = filteredTxs.filter(
    (tx) => tx.payload && !isTransferPayload(tx.payload)
  );
  // For display in the recent transactions list, apply category/type filters
  const displayTxs = displayFilteredTxs.filter((tx) => tx.payload);
  // Deduplicate transfer pairs — show each pair only once (the expense side)
  const deduplicatedTxs = (() => {
    const seen = new Set<string>();
    return displayTxs.filter((tx) => {
      if (tx.payload && isTransferPayload(tx.payload) && tx.payload.transfer_pair_id) {
        if (seen.has(tx.payload.transfer_pair_id)) return false;
        seen.add(tx.payload.transfer_pair_id);
      }
      return true;
    });
  })();
  const recentTxs = deduplicatedTxs.slice(0, 10);
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

  // Total net worth per currency. The per-account balance is the live
  // current-month checkpoint (the running balance) when available; otherwise
  // the sum of downloaded transactions (pre-migration fallback).
  const netWorthByCurrency = (() => {
    const byCur: Record<string, number> = {};
    const curMonthEnd = transactionMonthEnd(new Date().toISOString());
    for (const acc of accounts) {
      const entries = useCheckpointStore.getState().getEntries(acc.id);
      let balance: number | null = null;
      if (entries.length > 0) {
        balance = useCheckpointStore.getState().balanceThrough(acc.id, curMonthEnd);
      }
      if (balance === null) {
        // No usable checkpoint — sum account's window-transactions.
        const accountTxs = allTxs.filter((t) => t.account_id === acc.id);
        balance = accountTxs.reduce(
          (sum, tx) => sum + (tx.payload ? effectiveAmount(tx.payload) : 0), 0,
        );
      }
      const cur = acc.currency;
      byCur[cur] = (byCur[cur] || 0) + (balance!);
    }
    return byCur;
  })();

  // Category colors are now sourced from the category store (user-defined or deterministic fallback)

  // Group and compute balance over time — contiguous window from dateRange.start to dateRange.end.
  // Cumulative starts from the day before the window; the pre-window balance is
  // Σ_accounts [ checkpoint(account, lastMonthEndBefore(windowStart))
  //              + Σ in-month tx before windowStart ] (spec §4.5).
  // Falls back to the classic pre-window sum when checkpoints are unavailable.
  const balanceChartData = (() => {
    const startDate = new Date(dateRange.start + "T12:00:00");
    const endDate = new Date(dateRange.end + "T12:00:00");
    const windowStartEpoch = startDate.getTime();

    // 1. Compute the cumulative balance up to the day BEFORE the window starts.
    let openingBalance = 0;

    // Check if ANY account has loaded checkpoints. If all do, use checkpoint
    // path; otherwise, fall back to the classic sum for all accounts.
    const allHaveCheckpoints = accounts.every(
      (acc) => useCheckpointStore.getState().getEntries(acc.id).length > 0,
    );
    if (allHaveCheckpoints) {
      const startMonthEnd = transactionMonthEnd(new Date(windowStartEpoch).toISOString());
      const lastMonthEnd = previousMonthEnd(dateRange.start);
      for (const acc of accounts) {
        const cp = useCheckpointStore.getState().balanceThrough(acc.id, lastMonthEnd);
        openingBalance += cp ?? 0;
      }
      for (const tx of allTxs) {
        const txTime = new Date(tx.time).getTime();
        if (txTime < windowStartEpoch && transactionMonthEnd(tx.time) === startMonthEnd) {
          openingBalance += tx.payload ? effectiveAmount(tx.payload) : 0;
        }
      }
    } else {
      // Classic fallback: sum all pre-window transactions from downloaded data.
      for (const tx of allTxs) {
        if (tx.payload && new Date(tx.time).getTime() < windowStartEpoch) {
          openingBalance += effectiveAmount(tx.payload);
        }
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
        displayDate: formatDate(date, { month: "short", day: "numeric" }),
        balance: Number(cumulative.toFixed(2)),
      };
    });
  })();

  // Expenses by category — applies display filters + excludes transfers
  const expenseChartData = (() => {
    // Group by category_id when available, fall back to name
    const groups = new Map<string, { id?: string; name: string; value: number }>();
    displayFilteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount < 0 && !isTransferPayload(tx.payload)) {
        const key = tx.payload.category_id || tx.payload.category || "General";
        const existing = groups.get(key);
        if (existing) {
          existing.value += Math.abs(effectiveAmount(tx.payload));
        } else {
          groups.set(key, {
            id: tx.payload.category_id,
            name: useCategoryStore.getState().resolveCategoryName(tx.payload.category, tx.payload.category_id),
            value: Math.abs(effectiveAmount(tx.payload)),
          });
        }
      }
    });
    return Array.from(groups.values())
      .map((g) => ({ ...g, value: Number(g.value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  })();

  // Income by category — applies display filters + excludes transfers
  const incomeChartData = (() => {
    const groups = new Map<string, { id?: string; name: string; value: number }>();
    displayFilteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount > 0 && !isTransferPayload(tx.payload)) {
        const key = tx.payload.category_id || tx.payload.category || "General";
        const existing = groups.get(key);
        if (existing) {
          existing.value += effectiveAmount(tx.payload);
        } else {
          groups.set(key, {
            id: tx.payload.category_id,
            name: useCategoryStore.getState().resolveCategoryName(tx.payload.category, tx.payload.category_id),
            value: effectiveAmount(tx.payload),
          });
        }
      }
    });
    return Array.from(groups.values())
      .map((g) => ({ ...g, value: Number(g.value.toFixed(2)) }))
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

  // Edit a transaction from the detail overlay: open inline edit dialog
  const handleEditFromOverlay = useCallback((txId: string) => {
    if (!detailTx) return;
    setEditTx(detailTx);
    setEditOpen(true);
  }, [detailTx]);

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
      const rawAmount = parseLocaleNumber(data.amount);
      if (isNaN(rawAmount)) throw new Error("Invalid amount");
      const absAmount = Math.abs(rawAmount);
      const commission = data.commission ? parseLocaleNumber(data.commission) : 0;
      const time = new Date(data.date + "T12:00:00Z").toISOString();

      if (data.isTransfer && data.targetAccountId) {
        // ---- Account-to-account transfer ----
        // Generate a shared pair ID to link both sides
        const transferPairId = crypto.randomUUID();

        // Source account: expense
        const sourceKey = await getAccountKey(
          data.accountId,
          privKeyBase64 ?? undefined,
          user?.public_key
        );
        const sourceAccount = accounts.find((a) => a.id === data.accountId);
        const targetAccount = accounts.find((a) => a.id === data.targetAccountId);
        const sourcePayload = {
          amount: -absAmount,
          category: "Transfer",
          notes: data.notes,
          counterparty: data.counterparty,
          commission: commission > 0 ? commission : undefined,
          is_transfer: true,
          transfer_pair_id: transferPairId,
          transfer_source_account_id: data.accountId,
          transfer_target_account_id: data.targetAccountId,
          transfer_source_account_name: sourceAccount?.name || sourceAccount?.currency || data.accountId,
          transfer_target_account_name: targetAccount?.name || targetAccount?.currency || data.targetAccountId,
        };

        const sourceEncrypted = await encryptTransactionPayload(sourcePayload, sourceKey);
        await apiFetch<Transaction>(ENDPOINTS.transactions(data.accountId), {
          method: "POST",
          body: JSON.stringify({ time, encrypted_payload: sourceEncrypted }),
        });

        // Target account: income
        const targetKey = await getAccountKey(
          data.targetAccountId,
          privKeyBase64 ?? undefined,
          user?.public_key
        );
        const targetPayload = {
          amount: absAmount,
          category: "Transfer",
          notes: data.notes,
          counterparty: data.counterparty,
          commission: commission > 0 ? commission : undefined,
          is_transfer: true,
          transfer_pair_id: transferPairId,
          transfer_source_account_id: data.accountId,
          transfer_target_account_id: data.targetAccountId,
          transfer_source_account_name: sourceAccount?.name || sourceAccount?.currency || data.accountId,
          transfer_target_account_name: targetAccount?.name || targetAccount?.currency || data.targetAccountId,
        };
        const targetEncrypted = await encryptTransactionPayload(targetPayload, targetKey);
        await apiFetch<Transaction>(ENDPOINTS.transactions(data.targetAccountId), {
          method: "POST",
          body: JSON.stringify({ time, encrypted_payload: targetEncrypted }),
        });

        setCreateOpen(false);
        refreshTransactions();
        return;
      }

      // ---- Regular transaction ----
      const amount = data.type === "expense" ? -absAmount : absAmount;
      const accountKeyBase64 = await getAccountKey(
        data.accountId,
        privKeyBase64 ?? undefined,
        user?.public_key
      );

      const category = data.category || "general";
      // Ensure category exists on the server and get its stable id
      const categoryId = await useCategoryStore.getState().ensureCategory(data.type as CategoryType, category);

      const encryptedPayload = await encryptTransactionPayload(
        { amount, category, category_id: categoryId, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined },
        accountKeyBase64
      );

      const body: Record<string, any> = { time, encrypted_payload: encryptedPayload };

      // If this is a "send to user" transaction, also encrypt with server's public key
      if (data.targetEmail) {
        const pubKeyResp = await apiFetch<{ public_key: string }>(ENDPOINTS.rulePublicKey);
        if (!pubKeyResp?.public_key) throw new Error("Failed to get server public key");

        const serverEncryptedPayload = await encryptForRecipient(
          { amount, category, notes: data.notes, commission: commission > 0 ? commission : undefined },
          pubKeyResp.public_key,
        );

        body.target_email = data.targetEmail;
        body.server_encrypted_payload = serverEncryptedPayload;
      }

      const createdTx = await apiFetch<Transaction>(ENDPOINTS.transactions(data.accountId), {
        method: "POST",
        body: JSON.stringify(body),
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

  // Update transaction (called by TransactionForm in edit mode)
  const handleUpdateTransaction = async (data: TransactionFormData) => {
    if (!editTx) return;
    setTxUpdateError("");
    setTxUpdating(true);

    try {
      const rawAmount = parseLocaleNumber(data.amount);
      if (isNaN(rawAmount)) throw new Error("Invalid amount");
      const absAmount = Math.abs(rawAmount);
      const commission = data.commission ? parseLocaleNumber(data.commission) : 0;
      const interest = data.interest_amount ? parseLocaleNumber(data.interest_amount) : 0;
      const time = new Date(data.date + "T12:00:00Z").toISOString();

      const existingPayload = editTx.payload;
      const wasTransfer = existingPayload ? isTransferPayload(existingPayload) : false;
      const existingPairId = existingPayload?.transfer_pair_id;

      if (data.isTransfer && data.targetAccountId) {
        // ---- Updating as a transfer ----
        const transferPairId = existingPairId || crypto.randomUUID();

        // Determine which side we are currently on
        const currentIsSource = !existingPayload || existingPayload.amount < 0;

        const sourceAccountId = currentIsSource ? data.accountId : data.targetAccountId;
        const targetAccountId = currentIsSource ? data.targetAccountId : data.accountId;

        // Build payloads for both sides
        const sourceAccount = accounts.find((a) => a.id === sourceAccountId);
        const targetAccount = accounts.find((a) => a.id === targetAccountId);
        const sourceName = sourceAccount?.name || sourceAccount?.currency || sourceAccountId;
        const targetName = targetAccount?.name || targetAccount?.currency || targetAccountId;
        const counterpartyText = `${sourceName} → ${targetName}`;

        const sourcePayload = {
          amount: -absAmount,
          category: "Transfer",
          notes: data.notes,
          counterparty: counterpartyText,
          commission: commission > 0 ? commission : undefined,
          is_transfer: true,
          transfer_pair_id: transferPairId,
          transfer_source_account_id: sourceAccountId,
          transfer_target_account_id: targetAccountId,
          transfer_source_account_name: sourceName,
          transfer_target_account_name: targetName,
        };

        const targetPayload = {
          amount: absAmount,
          category: "Transfer",
          notes: data.notes,
          counterparty: counterpartyText,
          commission: commission > 0 ? commission : undefined,
          is_transfer: true,
          transfer_pair_id: transferPairId,
          transfer_source_account_id: sourceAccountId,
          transfer_target_account_id: targetAccountId,
          transfer_source_account_name: sourceName,
          transfer_target_account_name: targetName,
        };

        // Encrypt and update this side
        const currentKey = await getAccountKey(data.accountId, privKeyBase64 ?? undefined, user?.public_key);
        const currentEncrypted = await encryptTransactionPayload(
          currentIsSource ? sourcePayload : targetPayload,
          currentKey
        );
        await apiFetch(ENDPOINTS.transaction(editTx.id), {
          method: "PUT",
          body: JSON.stringify({ time, encrypted_payload: currentEncrypted } as CreateTransactionRequest),
        });

        // Find and update/create the paired side
        const pairedAccountId = currentIsSource ? targetAccountId : sourceAccountId;
        const pairedKey = await getAccountKey(pairedAccountId, privKeyBase64 ?? undefined, user?.public_key);

        if (existingPairId && wasTransfer) {
          // Update existing paired transaction
          const pairedTx = allTxs.find(
            (t) => t.id !== editTx.id && t.payload?.transfer_pair_id === existingPairId
          );
          if (pairedTx) {
            const pairedEncrypted = await encryptTransactionPayload(
              currentIsSource ? targetPayload : sourcePayload,
              pairedKey
            );
            await apiFetch(ENDPOINTS.transaction(pairedTx.id), {
              method: "PUT",
              body: JSON.stringify({ time, encrypted_payload: pairedEncrypted } as CreateTransactionRequest),
            });
          } else {
            // Paired tx not found in memory — still try to create a new one
            const pairedEncrypted = await encryptTransactionPayload(
              currentIsSource ? targetPayload : sourcePayload,
              pairedKey
            );
            await apiFetch(ENDPOINTS.transactions(pairedAccountId), {
              method: "POST",
              body: JSON.stringify({ time, encrypted_payload: pairedEncrypted }),
            });
          }
        } else {
          // Was not a transfer before — create new paired transaction
          const pairedEncrypted = await encryptTransactionPayload(
            currentIsSource ? targetPayload : sourcePayload,
            pairedKey
          );
          await apiFetch(ENDPOINTS.transactions(pairedAccountId), {
            method: "POST",
            body: JSON.stringify({ time, encrypted_payload: pairedEncrypted }),
          });
        }
      } else if (wasTransfer && existingPairId) {
        // ---- Was a transfer, now becoming a regular transaction ----
        // Delete the paired transaction
        const pairedTx = allTxs.find(
          (t) => t.id !== editTx.id && t.payload?.transfer_pair_id === existingPairId
        );
        if (pairedTx) {
          await apiFetch(ENDPOINTS.transaction(pairedTx.id), { method: "DELETE" });
        }

        // Fall through to regular update below
        const amount = data.type === "expense" ? -absAmount : absAmount;
        const accountKeyBase64 = await getAccountKey(
          editTx.account_id,
          privKeyBase64 ?? undefined,
          user?.public_key
        );
        const category = data.category || "general";
        const categoryId = await useCategoryStore.getState().ensureCategory(data.type as CategoryType, category);
        const encryptedPayload = await encryptTransactionPayload(
          { amount, category, category_id: categoryId, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined, interest_amount: interest > 0 ? interest : undefined },
          accountKeyBase64
        );
        await apiFetch(ENDPOINTS.transaction(editTx.id), {
          method: "PUT",
          body: JSON.stringify({ time, encrypted_payload: encryptedPayload } as CreateTransactionRequest),
        });
      } else {
        // ---- Regular transaction update ----
        const amount = data.type === "expense" ? -absAmount : absAmount;
        const accountKeyBase64 = await getAccountKey(
          editTx.account_id,
          privKeyBase64 ?? undefined,
          user?.public_key
        );

        const category = data.category || "general";
        const categoryId = await useCategoryStore.getState().ensureCategory(data.type as CategoryType, category);

        const encryptedPayload = await encryptTransactionPayload(
          { amount, category, category_id: categoryId, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined, interest_amount: interest > 0 ? interest : undefined },
          accountKeyBase64
        );

        await apiFetch(ENDPOINTS.transaction(editTx.id), {
          method: "PUT",
          body: JSON.stringify({ time, encrypted_payload: encryptedPayload } as CreateTransactionRequest),
        });
      }

      // Upload new document if provided (for the current transaction only)
      if (data.file) {
        const accountKeyBase64 = await getAccountKey(
          editTx.account_id,
          privKeyBase64 ?? undefined,
          user?.public_key
        );
        const fileData = await encryptFile(data.file, accountKeyBase64);
        await apiFetch(ENDPOINTS.transactionDocuments(editTx.id), {
          method: "POST",
          body: JSON.stringify(fileData),
        });
      }

      // Delete documents marked for removal
      for (const docId of data.documentsToDelete) {
        await apiFetch(ENDPOINTS.transactionDocument(editTx.id, docId), {
          method: "DELETE",
        });
      }

      setEditOpen(false);
      setEditTx(null);
      refreshTransactions();
    } catch (err: any) {
      setTxUpdateError(err.message);
    } finally {
      setTxUpdating(false);
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
              accounts={accounts
                .map((a) => ({ id: a.id, label: `${a.name || a.currency} (${a.type})` }))
                .sort((a, b) => a.label.localeCompare(b.label))}
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
                      {formatNumber(val)}
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">Recent Transactions</CardTitle>
                {deduplicatedTxs.length > 0 && (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowAllOpen(true)}>
                    Show All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto">
              {recentTxs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[260px] text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    {deduplicatedTxs.length === 0
                      ? 'No transactions yet. Add one to get started.'
                      : 'No transactions in selected range.'}
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

      {/* Edit transaction dialog */}
      {editTx?.payload && (
        <ResponsiveDialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditTx(null); }} title="Edit Transaction">
          <TransactionForm
            accounts={accounts
              .map((a) => ({ id: a.id, label: `${a.name || a.currency} (${a.type})` }))
              .sort((a, b) => a.label.localeCompare(b.label))}
            accountId={editTx.account_id}
            initialValues={{
              type: editTx.payload.amount >= 0 ? "income" : "expense",
              amount: formatNumber(Math.abs(editTx.payload.amount)),
              commission: editTx.payload.commission ? formatNumber(editTx.payload.commission) : "",
              interest_amount: editTx.payload.interest_amount ? formatNumber(editTx.payload.interest_amount) : "",
              date: editTx.time.slice(0, 10),
              category: editTx.payload.category ?? "",
              counterparty: editTx.payload.counterparty ?? "",
              notes: editTx.payload.notes ?? "",
              isTransfer: isTransferPayload(editTx.payload),
              targetAccountId: editTx.payload.is_transfer
                ? (editTx.payload.amount > 0
                    ? editTx.payload.transfer_source_account_id   // income side → other side is the source
                    : editTx.payload.transfer_target_account_id)  // expense side → other side is the target
                : undefined,
            }}
            getCategories={getCategories}
            addCategory={addCategory}
            onSave={handleUpdateTransaction}
            saving={txUpdating}
            error={txUpdateError}
            submitLabel="Save"
          />
        </ResponsiveDialog>
      )}

      {/* Budget Progress Section — pass all transactions (not filtered by date range) so budgets correctly compute against their own period */}
      <BudgetProgressSection transactions={allTxs} />

      {/* Pie charts: side by side below the main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Expenses Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold">Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryPieChart
              data={expenseChartData}
              total={expenseTotal}
              currency={defaultCurrency}
              type="expense"
            />
          </CardContent>
        </Card>

        {/* Income Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold">Income by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryPieChart
              data={incomeChartData}
              total={incomeTotal}
              currency={defaultCurrency}
              type="income"
            />
          </CardContent>
        </Card>
      </div>

      {/* Show All Transactions overlay (all accounts) */}
      <ResponsiveDialog open={showAllOpen} onOpenChange={setShowAllOpen} title="All Transactions">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {deduplicatedTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No transactions in the selected range.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Showing {deduplicatedTxs.length} transaction{deduplicatedTxs.length !== 1 ? "s" : ""} across {currencyMap ? new Set(deduplicatedTxs.map((tx) => tx.account_id)).size : 0} accounts
              </p>
              {deduplicatedTxs.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  transaction={{
                    id: tx.id,
                    time: tx.time,
                    account_id: tx.account_id,
                    payload: tx.payload,
                  }}
                  currency={currencyMap[tx.account_id]}
                  onClick={
                    tx.payload
                      ? () => {
                          setShowAllOpen(false);
                          setDetailTx(tx);
                          setDetailOpen(true);
                        }
                      : undefined
                  }
                  compact
                />
              ))}
            </>
          )}
        </div>
      </ResponsiveDialog>
    </div>
  );
}
