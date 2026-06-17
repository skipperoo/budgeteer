import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BudgetProgressBar } from "@/components/shared/BudgetProgressBar";
import { useBudgetStore } from "@/stores/budget-store";
import { useAuthStore } from "@/stores/auth-store";
import { useAccountStore } from "@/stores/account-store";
import { decryptECIESPayload } from "@/lib/crypto-rules";
import { bytesToBase64 } from "@/lib/crypto";
import { effectiveAmount, type TransactionPayload } from "@/lib/crypto-transaction";
import type { BudgetPayload } from "@/types";

interface BudgetProgressItem {
  budgetId: string;
  label: string;
  spent: number;
  max: number;
  accountId?: string;
  category?: string;
  currency: string;
}

interface BudgetTransaction {
  account_id?: string;
  time: string;
  payload: TransactionPayload | null;
}

interface BudgetProgressSectionProps {
  transactions: BudgetTransaction[];
  /** If set, only show budgets for this account */
  accountId?: string;
  /** If true, show a compact version */
  compact?: boolean;
}

export function BudgetProgressSection({
  transactions,
  accountId,
  compact = false,
}: BudgetProgressSectionProps) {
  const { budgets, fetchBudgets, notifyThreshold } = useBudgetStore();
  const user = useAuthStore((s) => s.user);
  const plaintextPrivateKey = useAuthStore((s) => s.plaintextPrivateKey);
  const { accounts } = useAccountStore();

  const [decryptedPayloads, setDecryptedPayloads] = useState<
    Record<string, BudgetPayload | null>
  >({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  // Decrypt all budget payloads
  useEffect(() => {
    const decryptAll = async () => {
      const privKeyBase64 = plaintextPrivateKey
        ? bytesToBase64(new Uint8Array(plaintextPrivateKey))
        : null;
      if (!privKeyBase64) return;

      const results: Record<string, BudgetPayload | null> = {};
      for (const budget of budgets) {
        try {
          results[budget.id] = await decryptECIESPayload<BudgetPayload>(
            budget.encrypted_payload,
            privKeyBase64,
          );
        } catch {
          results[budget.id] = null;
        }
      }
      setDecryptedPayloads(results);
    };
    if (budgets.length > 0 && plaintextPrivateKey) {
      decryptAll();
    }
  }, [budgets, plaintextPrivateKey]);

  // Filter budgets relevant to this view
  const relevantBudgets = useMemo(() => {
    return budgets.filter((b) => {
      if (accountId) {
        // Account view: only budgets for this account or global budgets
        return !b.account_id || b.account_id === accountId;
      }
      // Dashboard: show all budgets
      return true;
    });
  }, [budgets, accountId]);

  // Compute progress for each budget, filtering by the budget's own period
  const progressItems: BudgetProgressItem[] = useMemo(() => {
    const currencyMap: Record<string, string> = {};
    for (const acc of accounts) {
      currencyMap[acc.id] = acc.currency;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    const items: BudgetProgressItem[] = [];

    for (const budget of relevantBudgets) {
      const payload = decryptedPayloads[budget.id];
      if (!payload) continue;

      const currency = budget.account_id
        ? currencyMap[budget.account_id] || "USD"
        : accounts.length > 0
          ? accounts[0].currency
          : "USD";

      // Determine date range for this budget's period
      // Monthly budgets: only current month; Yearly budgets: only current year.
      // If explicit end_date is set, use that as the upper bound.
      // If explicit start_date is set, the budget counts from that date forward.
      const budgetStartStr = budget.start_date; // "YYYY-MM-DD"
      const budgetStart = budgetStartStr ? new Date(budgetStartStr + "T00:00:00Z") : null;

      let periodStart: Date;
      let periodEnd: Date;

      if (budget.period === "yearly") {
        periodStart = new Date(`${currentYear}-01-01T00:00:00Z`);
        periodEnd = new Date(`${currentYear + 1}-01-01T00:00:00Z`);
      } else {
        // monthly
        periodStart = new Date(`${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01T00:00:00Z`);
        // next month 1st
        if (currentMonth === 11) {
          periodEnd = new Date(`${currentYear + 1}-01-01T00:00:00Z`);
        } else {
          periodEnd = new Date(`${currentYear}-${String(currentMonth + 2).padStart(2, "0")}-01T00:00:00Z`);
        }
      }

      // If the budget has a start_date after periodStart, use it instead
      if (budgetStart && budgetStart > periodStart) {
        periodStart = budgetStart;
      }
      // If the budget has an end_date, cap the period
      if (budget.end_date) {
        const customEnd = new Date(budget.end_date + "T23:59:59Z");
        if (customEnd < periodEnd) {
          periodEnd = customEnd;
        }
      }

      // Filter transactions for this budget
      let relevantTxs = transactions.filter((tx) => {
        const txTime = new Date(tx.time);
        return txTime >= periodStart && txTime <= periodEnd;
      });
      if (budget.account_id) {
        relevantTxs = relevantTxs.filter(
          (tx) => tx.account_id === budget.account_id,
        );
      }
      if (payload.category) {
        relevantTxs = relevantTxs.filter(
          (tx) =>
            tx.payload?.category?.toLowerCase() ===
            payload.category?.toLowerCase(),
        );
      }

      // Sum up expenses only (negative amounts)
      const spent = relevantTxs.reduce((sum, tx) => {
        const amt = tx.payload ? effectiveAmount(tx.payload) : 0;
        return sum + (amt < 0 ? Math.abs(amt) : 0);
      }, 0);

      items.push({
        budgetId: budget.id,
        label: payload.category || "All Categories",
        spent,
        max: payload.amount,
        accountId: budget.account_id || undefined,
        category: payload.category || undefined,
        currency,
      });
    }

    return items;
  }, [relevantBudgets, decryptedPayloads, transactions, accounts]);

  if (relevantBudgets.length === 0) return null;

  // Check thresholds and notify (only on the dashboard, when data is fresh)
  useEffect(() => {
    const checkThresholds = async () => {
      for (const item of progressItems) {
        if (item.max <= 0) continue;
        const ratio = item.spent / item.max;

        // Check 50%, 80%, 100% thresholds
        const thresholds: Array<{ pct: number; val: 50 | 80 | 100 }> = [
          { pct: 0.5, val: 50 },
          { pct: 0.8, val: 80 },
          { pct: 1.0, val: 100 },
        ];

        for (const { pct, val } of thresholds) {
          if (ratio >= pct) {
            try {
              await notifyThreshold(item.budgetId, val);
            } catch {
              // Already notified or error — ignore
            }
          }
        }
      }
    };
    if (progressItems.length > 0) {
      checkThresholds();
    }
  }, [progressItems, notifyThreshold]);

  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : "pb-3"}>
        <CardTitle className={compact ? "text-base" : "text-lg font-bold"}>
          Budget Progress
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? "space-y-3" : "space-y-4"}>
        {progressItems.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No budgets set. Create budgets to track spending limits.
          </p>
        )}
        {progressItems.map((item) => (
          <BudgetProgressBar
            key={item.budgetId}
            label={item.label}
            current={item.spent}
            max={item.max}
            currency={item.currency}
            compact={compact}
          />
        ))}
      </CardContent>
    </Card>
  );
}
