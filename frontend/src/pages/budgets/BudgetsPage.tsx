import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useBudgetStore } from "@/stores/budget-store";
import { useAccountStore } from "@/stores/account-store";
import { useAuthStore } from "@/stores/auth-store";
import { encryptForRecipient, decryptECIESPayload } from "@/lib/crypto-rules";
import { bytesToBase64 } from "@/lib/crypto";
import { formatDate } from "@/lib/format";
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { BudgetProgressBar } from "@/components/shared/BudgetProgressBar";
import type { Budget, BudgetPayload } from "@/types";

export default function BudgetsPage() {
  const {
    budgets,
    fetchBudgets,
    createBudget,
    updateBudget,
    deleteBudget,
    loading,
    error: storeError,
  } = useBudgetStore();

  const { accounts, fetchAccounts } = useAccountStore();
  const user = useAuthStore((s) => s.user);
  const plaintextPrivateKey = useAuthStore((s) => s.plaintextPrivateKey);

  const [open, setOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPeriod, setFormPeriod] = useState<"monthly" | "yearly">("monthly");
  const [formAccountId, setFormAccountId] = useState("");
  const [formStartDate, setFormStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [formEndDate, setFormEndDate] = useState("");

  // Decrypted budgets with their payloads
  const [decryptedBudgets, setDecryptedBudgets] = useState<
    Array<{ budget: Budget; payload: BudgetPayload | null }>
  >([]);

  useEffect(() => {
    fetchBudgets();
    fetchAccounts();
  }, [fetchBudgets, fetchAccounts]);

  // Decrypt all budget payloads when budgets change
  useEffect(() => {
    const decryptAll = async () => {
      const privKeyBase64 = plaintextPrivateKey
        ? bytesToBase64(new Uint8Array(plaintextPrivateKey))
        : null;

      const results = await Promise.all(
        budgets.map(async (budget) => {
          try {
            if (privKeyBase64) {
              const payload = await decryptECIESPayload<BudgetPayload>(
                budget.encrypted_payload,
                privKeyBase64,
              );
              return { budget, payload };
            }
          } catch {
            // Decryption failed
          }
          return { budget, payload: null };
        }),
      );
      setDecryptedBudgets(results);
    };
    if (budgets.length > 0 && plaintextPrivateKey) {
      decryptAll();
    } else {
      setDecryptedBudgets(budgets.map((b) => ({ budget: b, payload: null })));
    }
  }, [budgets, plaintextPrivateKey]);

  const openCreate = () => {
    setEditingBudget(null);
    setFormName("");
    setFormAmount("");
    setFormCategory("");
    setFormPeriod("monthly");
    setFormAccountId("");
    const now = new Date();
    setFormStartDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
    setFormEndDate("");
    setFormError("");
    setOpen(true);
  };

  const openEdit = async (budget: Budget) => {
    setEditingBudget(budget);
    setFormError("");

    setFormName(budget.name || "");

    // Try to decrypt existing payload
    try {
      const privKeyBase64 = plaintextPrivateKey
        ? bytesToBase64(new Uint8Array(plaintextPrivateKey))
        : null;
      if (privKeyBase64) {
        const payload = await decryptECIESPayload<BudgetPayload>(
          budget.encrypted_payload,
          privKeyBase64,
        );
        setFormAmount(String(payload.amount));
        setFormCategory(payload.category || "");
      }
    } catch {
      setFormAmount("");
      setFormCategory("");
    }

    setFormPeriod(budget.period);
    setFormAccountId(budget.account_id || "");
    setFormStartDate(budget.start_date);
    setFormEndDate(budget.end_date || "");
    setOpen(true);
  };

  const handleSave = async () => {
    setFormError("");

    const rawAmount = parseFloat(formAmount);
    if (isNaN(rawAmount) || rawAmount <= 0) {
      setFormError("Please enter a valid amount");
      return;
    }
    if (!user?.public_key) {
      setFormError("Encryption key not available");
      return;
    }

    setSaving(true);
    try {
      // Encrypt payload with user's own X25519 public key
      const payload: BudgetPayload = {
        amount: rawAmount,
        category: formCategory.trim() || undefined,
      };

      const encryptedPayload = await encryptForRecipient(payload, user.public_key);

      if (editingBudget) {
        await updateBudget(editingBudget.id, {
          name: formName.trim() || undefined,
          encrypted_payload: encryptedPayload,
          period: formPeriod,
          start_date: formStartDate,
          end_date: formEndDate || undefined,
          // Send empty string for "All Accounts" (backend converts "" to NULL)
          account_id: formAccountId,
        });
      } else {
        await createBudget({
          name: formName.trim() || "Budget",
          encrypted_payload: encryptedPayload,
          period: formPeriod,
          start_date: formStartDate,
          end_date: formEndDate || undefined,
          account_id: formAccountId || undefined,
        });
      }

      setOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Failed to save budget");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this budget?")) {
      try {
        await deleteBudget(id);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Budgets</h1>
          <p className="text-muted-foreground mt-1">
            Set monthly or yearly spending limits for your accounts and categories.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Budget
        </Button>
      </div>

      {storeError && (
        <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3">
          {storeError}
        </div>
      )}

      {loading && budgets.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading budgets...
        </div>
      ) : decryptedBudgets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No budgets yet. Create your first budget to start tracking spending limits.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Budget
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {decryptedBudgets.map(({ budget, payload }) => {
            const accountName = budget.account_id
              ? accounts.find((a) => a.id === budget.account_id)?.name ||
                budget.account_id.slice(0, 8)
              : "All Accounts";
            const accountCurrency =
              (budget.account_id
                ? accounts.find((a) => a.id === budget.account_id)?.currency
                : undefined) || "USD";

            return (
              <Card key={budget.id}>
                <CardHeader className="pb-3 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <span>{budget.name || payload?.category || "Budget"}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        ({accountName})
                      </span>
                      {payload?.category && (
                        <span className="text-[10px] uppercase font-bold tracking-wider bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                          {payload.category}
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {budget.period}
                      {budget.end_date && ` · until ${formatDate(budget.end_date)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(budget)}
                      aria-label="Edit budget"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(budget.id)}
                      aria-label="Delete budget"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {payload ? (
                    <BudgetProgressBar
                      name={budget.name || payload.category || "Budget"}
                      current={0} // will be computed from transactions
                      max={payload.amount}
                      currency={accountCurrency}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Unable to decrypt budget details
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Started {formatDate(budget.start_date)}
                    {budget.end_date && ` · Ends ${formatDate(budget.end_date)}`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={editingBudget ? "Edit Budget" : "New Budget"}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="budget-name">Budget Name</Label>
            <Input
              id="budget-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Monthly Groceries"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-amount">Budget Amount</Label>
            <Input
              id="budget-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-category">Category (optional)</Label>
            <Input
              id="budget-category"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="e.g. Groceries, Dining, Utilities"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to apply to all categories.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-account">Account (optional)</Label>
            <select
              id="budget-account"
              value={formAccountId}
              onChange={(e) => setFormAccountId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.currency} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-period">Period</Label>
            <select
              id="budget-period"
              value={formPeriod}
              onChange={(e) => setFormPeriod(e.target.value as "monthly" | "yearly")}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-start">Start Date</Label>
            <Input
              id="budget-start"
              type="date"
              value={formStartDate}
              onChange={(e) => setFormStartDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-end">End Date (optional)</Label>
            <Input
              id="budget-end"
              type="date"
              value={formEndDate}
              onChange={(e) => setFormEndDate(e.target.value)}
            />
          </div>

          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}

          <Button onClick={handleSave} className="w-full" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : editingBudget ? (
              "Update Budget"
            ) : (
              "Create Budget"
            )}
          </Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
