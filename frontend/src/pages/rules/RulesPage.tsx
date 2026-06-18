import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRuleStore, type Rule, type CreateRuleRequest } from "@/stores/rule-store";
import { useAccountStore } from "@/stores/account-store";
import { useCategoryStore, type CategoryType } from "@/stores/category-store";
import { encryptForRecipient } from "@/lib/crypto-rules";
import { formatDate, formatDateTimeWithOffset, formatCurrency, utcToLocalDatetime, getGMTOffset } from "@/lib/format";
import { Trash2, Plus, Pencil, Loader2, AlertCircle, Info } from "lucide-react";

type RuleType = "payment" | "income" | "transfer" | "user_transfer" | "mortgage";

export default function RulesPage() {
  const navigate = useNavigate();
  const {
    rules,
    serverPublicKey,
    fetchServerPublicKey,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    loading,
    error: storeError,
  } = useRuleStore();

  const { accounts, fetchAccounts } = useAccountStore();
  const { getCategories, addCategory } = useCategoryStore();

  const [open, setOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [noAccountsDialogOpen, setNoAccountsDialogOpen] = useState(false);

  // Form state (individual fields matching existing codebase pattern)
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<RuleType>("payment");
  const [formAmount, setFormAmount] = useState("");
  const [formSourceAccountId, setFormSourceAccountId] = useState("");
  const [formTargetAccountId, setFormTargetAccountId] = useState("");
  const [formTargetUserId, setFormTargetUserId] = useState("");
  const [formTargetEmail, setFormTargetEmail] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formCommission, setFormCommission] = useState("");
  const [formAlertOffset, setFormAlertOffset] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formCounterparty, setFormCounterparty] = useState("");
  const [formFrequency, setFormFrequency] = useState("monthly");
  const [formNextOccurrence, setFormNextOccurrence] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formMaxOccurrences, setFormMaxOccurrences] = useState("");

  // Category "add new" state
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Mortgage-specific form state
  const [formMortgageTotalAmount, setFormMortgageTotalAmount] = useState("");
  const [formMortgageInterestRate, setFormMortgageInterestRate] = useState("");
  const [formMortgageTermMonths, setFormMortgageTermMonths] = useState("");
  const [formMortgagePaymentDay, setFormMortgagePaymentDay] = useState("1");
  const [formMortgageAmortizationType, setFormMortgageAmortizationType] = useState("french");
  const [amortizationModalOpen, setAmortizationModalOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!serverPublicKey) {
      fetchServerPublicKey().catch(() => {});
    }
    fetchRules();
    fetchAccounts();
  }, []);

  // Get categories for the selected type.
  // Payment rules use expense categories; transfer/user_transfer rules can use either.
  const categories = useMemo(() => {
    if (formType === "payment") {
      return getCategories("expense");
    }
    // For transfer and user_transfer, offer both income and expense categories
    const incomeCats = getCategories("income");
    const expenseCats = getCategories("expense");
    return [...new Set([...incomeCats, ...expenseCats])];
  }, [formType, getCategories, useCategoryStore.getState().version]);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormType("payment");
    setFormAmount("");
    setFormSourceAccountId("");
    setFormTargetAccountId("");
    setFormTargetUserId("");
    setFormCategory("");
    setFormNotes("");
    setFormCounterparty("");
    setFormFrequency("monthly");
    setFormNextOccurrence(utcToLocalDatetime(new Date(Date.now() + 86400000).toISOString()));
    setFormEndDate("");
    setFormMaxOccurrences("");
    setFormMortgageTotalAmount("");
    setFormMortgageInterestRate("");
    setFormMortgageTermMonths("");
    setFormMortgagePaymentDay("1");
    setFormMortgageAmortizationType("french");
    setShowCategoryInput(false);
    setNewCategoryName("");
    setFormError(null);
  }, []);

  const openCreate = useCallback(() => {
    setEditingRule(null);
    resetForm();
    setOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((rule: Rule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormType("payment");
    setFormAmount("");
    setFormSourceAccountId("");
    setFormTargetAccountId("");
    setFormTargetUserId("");
    setFormCategory("");
    setFormNotes("");
    setFormCounterparty("");
    setFormFrequency(rule.frequency);
    setFormNextOccurrence(utcToLocalDatetime(rule.next_occurrence));
    setFormEndDate(rule.end_date
      ? new Date(rule.end_date).toISOString().slice(0, 16)
      : "");
    setFormMaxOccurrences(rule.max_occurrences?.toString() ?? "");
    setShowCategoryInput(false);
    setNewCategoryName("");
    setFormError(null);
    setOpen(true);
  }, []);

  const handleAddNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await addCategory("expense", name);
      setFormCategory(name);
      setShowCategoryInput(false);
      setNewCategoryName("");
    } catch {
      setFormError("Failed to add category");
    }
  };

  const handleSave = async () => {
    setFormError(null);

    if (!formName.trim()) {
      setFormError("Name is required");
      return;
    }
    if (formType !== "mortgage" && (!formAmount || parseFloat(formAmount) <= 0)) {
      setFormError("Amount must be positive");
      return;
    }
    if (!formNextOccurrence) {
      setFormError("Next occurrence is required");
      return;
    }
    if (!formSourceAccountId) {
      setFormError("Source account is required");
      return;
    }
    if (
      formType === "transfer" &&
      !formTargetAccountId
    ) {
      setFormError("Target account is required for transfers");
      return;
    }
    if (formType === "user_transfer" && !formTargetEmail.trim()) {
      setFormError("Target email is required for user transfers");
      return;
    }
    if (formType === "mortgage") {
      if (!formMortgageTotalAmount || parseFloat(formMortgageTotalAmount) <= 0) {
        setFormError("Total mortgage amount is required");
        return;
      }
      if (!formMortgageInterestRate || parseFloat(formMortgageInterestRate) < 0) {
        setFormError("Interest rate is required");
        return;
      }
      if (!formMortgageTermMonths || parseInt(formMortgageTermMonths, 10) < 1) {
        setFormError("Term in months is required");
        return;
      }
      if (!formMortgagePaymentDay || parseInt(formMortgagePaymentDay, 10) < 1 || parseInt(formMortgagePaymentDay, 10) > 28) {
        setFormError("Payment day must be between 1 and 28");
        return;
      }
    }

    setSaving(true);
    try {
      const commission = formCommission ? parseFloat(formCommission) : 0;

      let payload: Record<string, unknown>;

      if (formType === "mortgage") {
        payload = {
          type: formType,
          source_account_id: formSourceAccountId,
          category_id: formCategory || undefined,
          notes: formNotes || undefined,
          counterparty: formCounterparty || undefined,
          commission: commission > 0 ? commission : undefined,
          mortgage_total_amount: parseFloat(formMortgageTotalAmount),
          mortgage_interest_rate: parseFloat(formMortgageInterestRate),
          mortgage_term_months: parseInt(formMortgageTermMonths, 10),
          mortgage_payment_day: parseInt(formMortgagePaymentDay, 10),
          mortgage_amortization_type: formMortgageAmortizationType,
          mortgage_remaining_balance: parseFloat(formMortgageTotalAmount),
        };
      } else {
        payload = {
          type: formType,
          amount: parseFloat(formAmount),
          source_account_id: formSourceAccountId,
          target_account_id:
            formType === "transfer"
              ? formTargetAccountId
              : undefined,
          // For user_transfer with invitation flow, target_account_id and
          // target_user_id are set by the server upon acceptance (not by sender).
          category_id: formCategory || undefined,
          notes: formNotes || undefined,
          counterparty: formCounterparty || undefined,
          commission: commission > 0 ? commission : undefined,
        };
      }

      if (!serverPublicKey) {
        await fetchServerPublicKey();
      }
      const pubKey = useRuleStore.getState().serverPublicKey;
      if (!pubKey) {
        setFormError("Server public key not available");
        setSaving(false);
        return;
      }
      const encryptedPayload = await encryptForRecipient(payload, pubKey);

      const nextOccurrence = new Date(formNextOccurrence).toISOString();

      const alertOffset = formAlertOffset || undefined;

      if (editingRule) {
        await updateRule(editingRule.id, {
          name: formName.trim(),
          encrypted_payload: encryptedPayload,
          frequency: formFrequency,
          next_occurrence: nextOccurrence,
          end_date: formEndDate
            ? new Date(formEndDate).toISOString()
            : null,
          max_occurrences: formMaxOccurrences
            ? parseInt(formMaxOccurrences, 10)
            : undefined,
          alert_offset: alertOffset ?? null,
        });
      } else {
        const req: CreateRuleRequest = {
          name: formName.trim(),
          encrypted_payload: encryptedPayload,
          frequency: formFrequency,
          next_occurrence: nextOccurrence,
          end_date: formEndDate
            ? new Date(formEndDate).toISOString()
            : undefined,
          max_occurrences: formMaxOccurrences
            ? parseInt(formMaxOccurrences, 10)
            : undefined,
          target_email: formType === "user_transfer" ? formTargetEmail.trim() : undefined,
          alert_offset: alertOffset,
        };
        await createRule(req);
      }

      setOpen(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save rule",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: Rule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await deleteRule(rule.id);
    } catch {
      // error is in store
    }
  };

  const handleToggleActive = async (rule: Rule) => {
    try {
      await updateRule(rule.id, { is_active: !rule.is_active });
    } catch {
      // error is in store
    }
  };

  const getFrequencyLabel = (freq: string): string => {
    switch (freq) {
      case "daily": return "Daily";
      case "weekly": return "Weekly";
      case "monthly": return "Monthly";
      case "yearly": return "Yearly";
      default: return freq;
    }
  };

  const selectStyles =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  const freqOptions = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rules</h1>
          <p className="text-muted-foreground text-sm">
            Automated payments and transfers
          </p>
        </div>
        <Button onClick={() => {
          if (accounts.length === 0) {
            setNoAccountsDialogOpen(true);
          } else {
            openCreate();
          }
        }}>
          <Plus className="h-4 w-4 mr-2" />
          New Rule
        </Button>
      </div>

      {storeError && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {storeError}
        </div>
      )}

      {loading && rules.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No rules yet.</p>
            <p className="text-sm mt-1">
              Create a rule to automate recurring payments or transfers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => (
            <Card
              key={rule.id}
              className={`${!rule.is_active ? "opacity-60" : ""}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{rule.name}</CardTitle>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={rule.is_active}
                      onChange={() => handleToggleActive(rule)}
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                  </label>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {rule.status === "pending_accepted" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className="text-amber-500 font-medium">Waiting for acceptance</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frequency</span>
                    <span>{getFrequencyLabel(rule.frequency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next</span>
                    <span className="text-right text-xs sm:text-sm">{formatDateTimeWithOffset(rule.next_occurrence)}</span>
                  </div>
                  {rule.max_occurrences && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Executed</span>
                      <span>
                        {rule.occurrences_so_far}/{rule.max_occurrences}
                      </span>
                    </div>
                  )}
                  {rule.last_triggered_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last run</span>
                      <span>{formatDate(rule.last_triggered_at)}</span>
                    </div>
                  )}
                  {rule.mortgage_progress && (
                    <div className="mt-4 pt-3 border-t space-y-3">
                      {/* Progress bar */}
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Repaid</span>
                          <span>
                            {rule.mortgage_progress.total_payments_made} of {rule.mortgage_progress.term_months} payments
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5">
                          <div
                            className="bg-primary h-2.5 rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                (rule.mortgage_progress.total_payments_made / rule.mortgage_progress.term_months) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-secondary/40 rounded-md p-2 text-center">
                          <span className="block text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                            Paid
                          </span>
                          <span className="font-semibold text-income tabular-nums">
                            {formatCurrency(
                              Math.max(0, rule.mortgage_progress.total_amount - rule.mortgage_progress.remaining_balance),
                              rule.mortgage_progress.currency
                            )}
                          </span>
                        </div>
                        <div className="bg-secondary/40 rounded-md p-2 text-center">
                          <span className="block text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                            Interest
                          </span>
                          <span className="font-semibold text-destructive tabular-nums">
                            {formatCurrency(rule.mortgage_progress.total_interest_paid, rule.mortgage_progress.currency)}
                          </span>
                        </div>
                        <div className="bg-secondary/40 rounded-md p-2 text-center">
                          <span className="block text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                            Remaining
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatCurrency(rule.mortgage_progress.remaining_balance, rule.mortgage_progress.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(rule)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(rule)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={editingRule ? "Edit Rule" : "New Rule"}
      >
        <div className="space-y-4">
          {formError && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {formError}
            </div>
          )}

          <div className="space-y-3">
            {/* Name */}
            <div className="space-y-1">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Rent, Netflix, Savings transfer..."
              />
            </div>

            {/* Type */}
            <div className="space-y-1">
              <Label htmlFor="rule-type">Type</Label>
              <select
                id="rule-type"
                value={formType}
                disabled={!!editingRule}
                onChange={(e) => {
                  setFormType(e.target.value as RuleType);
                  setFormCategory("");
                  if (e.target.value === "mortgage") {
                    setFormFrequency("monthly");
                  }
                }}
                className={selectStyles}
              >
                <option value="payment">Payment</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer (your accounts)</option>
                <option value="user_transfer">Transfer (to another user)</option>
                <option value="mortgage">Mortgage</option>
              </select>
            </div>

            {/* Amount (not shown for mortgages — computed from mortgage parameters) */}
            {formType !== "mortgage" && (
              <div className="space-y-1">
                <Label htmlFor="rule-amount">Amount</Label>
                <Input
                  id="rule-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="100.00"
                />
              </div>
            )}

            {/* Source Account */}
            <div className="space-y-1">
              <Label htmlFor="rule-source">Source Account</Label>
              <select
                id="rule-source"
                value={formSourceAccountId}
                onChange={(e) => setFormSourceAccountId(e.target.value)}
                className={selectStyles}
              >
                <option value="">Select account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.currency} ({a.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Mortgage-specific fields */}
            {formType === "mortgage" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="rule-mortgage-total">Total Mortgage Amount</Label>
                  <Input
                    id="rule-mortgage-total"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formMortgageTotalAmount}
                    onChange={(e) => setFormMortgageTotalAmount(e.target.value)}
                    placeholder="200000.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rule-mortgage-rate">Interest Rate (% per year)</Label>
                  <Input
                    id="rule-mortgage-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formMortgageInterestRate}
                    onChange={(e) => setFormMortgageInterestRate(e.target.value)}
                    placeholder="3.5"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rule-mortgage-term">Term (months)</Label>
                  <Input
                    id="rule-mortgage-term"
                    type="number"
                    min="1"
                    value={formMortgageTermMonths}
                    onChange={(e) => setFormMortgageTermMonths(e.target.value)}
                    placeholder="360"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rule-mortgage-day">Payment Day of Month (1-28)</Label>
                  <Input
                    id="rule-mortgage-day"
                    type="number"
                    min="1"
                    max="28"
                    value={formMortgagePaymentDay}
                    onChange={(e) => setFormMortgagePaymentDay(e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="rule-mortgage-amortization">Amortization Type</Label>
                    <button
                      type="button"
                      onClick={() => setAmortizationModalOpen(true)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Learn about amortization types"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                  <select
                    id="rule-mortgage-amortization"
                    value={formMortgageAmortizationType}
                    onChange={(e) => setFormMortgageAmortizationType(e.target.value)}
                    className={selectStyles}
                  >
                    <option value="french">French — Fixed Payment</option>
                    <option value="italian">Italian — Decreasing Payment</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    <button
                      type="button"
                      onClick={() => setAmortizationModalOpen(true)}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Learn the difference between French and Italian amortization
                    </button>
                  </p>
                </div>
              </>
            )}

            {/* Target Account (for self transfers only — user_transfer receiver chooses their own account) */}
            {formType === "transfer" && (
              <div className="space-y-1">
                <Label htmlFor="rule-target-account">Target Account</Label>
                <select
                  id="rule-target-account"
                  value={formTargetAccountId}
                  onChange={(e) => setFormTargetAccountId(e.target.value)}
                  className={selectStyles}
                >
                  <option value="">Select account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.currency} ({a.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Target Email (for user_transfer) */}
            {formType === "user_transfer" && (
              <div className="space-y-1">
                <Label htmlFor="rule-target-email">Target Email</Label>
                <Input
                  id="rule-target-email"
                  type="email"
                  value={formTargetEmail}
                  onChange={(e) => setFormTargetEmail(e.target.value)}
                  placeholder="user@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  The user will receive an invitation and will choose which
                  account receives the money. You won't see their account details.
                </p>
              </div>
            )}

            {/* Category (optional for all rule types) */}
            <div className="space-y-1">
              <Label htmlFor="rule-category">Category (optional)</Label>
                {!showCategoryInput ? (
                  <select
                    id="rule-category"
                    value={formCategory}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setShowCategoryInput(true);
                      } else {
                        setFormCategory(e.target.value);
                      }
                    }}
                    className={selectStyles}
                  >
                    <option value="">No category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__new__">+ Add new category...</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="New category name"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddNewCategory();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddNewCategory}
                    >
                      Add
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowCategoryInput(false);
                        setNewCategoryName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

            {/* Counterparty (for payment) */}
            {formType === "payment" && (
              <div className="space-y-1">
                <Label htmlFor="rule-counterparty">Counterparty (optional)</Label>
                <Input
                  id="rule-counterparty"
                  value={formCounterparty}
                  onChange={(e) => setFormCounterparty(e.target.value)}
                  placeholder="Landlord, Netflix, etc."
                />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="rule-notes">Notes (optional)</Label>
              <Input
                id="rule-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Monthly rent payment"
              />
            </div>

            {/* Commission (for all rule types) */}
            <div className="space-y-1">
              <Label htmlFor="rule-commission">Commission / Fee (optional)</Label>
              <Input
                id="rule-commission"
                type="number"
                step="0.01"
                min="0"
                value={formCommission}
                onChange={(e) => setFormCommission(e.target.value)}
                placeholder="0.00 — additional fee added to the amount"
              />
            </div>

            {/* Alert offset — when to send a reminder before the rule fires */}
            <div className="space-y-1">
              <Label htmlFor="rule-alert">Notify me before</Label>
              <select
                id="rule-alert"
                value={formAlertOffset}
                onChange={(e) => setFormAlertOffset(e.target.value)}
                className={selectStyles}
              >
                <option value="">Don't notify</option>
                <option value="1 hour">1 hour before</option>
                <option value="2 hours">2 hours before</option>
                <option value="12 hours">12 hours before</option>
                <option value="1 day">1 day before</option>
                <option value="2 days">2 days before</option>
                <option value="1 week">1 week before</option>
                <option value="2 weeks">2 weeks before</option>
              </select>
            </div>

            {/* Frequency */}
            <div className="space-y-1">
              <Label htmlFor="rule-frequency">Frequency</Label>
              <select
                id="rule-frequency"
                value={formFrequency}
                disabled={formType === "mortgage"}
                onChange={(e) => setFormFrequency(e.target.value)}
                className={selectStyles}
              >
                {freqOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {formType === "mortgage" && (
                <p className="text-xs text-muted-foreground">
                  Mortgages are always monthly.
                </p>
              )}
            </div>

            {/* First Occurrence */}
            <div className="space-y-1">
              <Label htmlFor="rule-first-occurrence">First Occurrence</Label>
              <Input
                id="rule-first-occurrence"
                type="datetime-local"
                value={formNextOccurrence}
                onChange={(e) => setFormNextOccurrence(e.target.value)}
              />
            </div>

            {/* End Date */}
            <div className="space-y-1">
              <Label htmlFor="rule-end-date">End Date (optional)</Label>
              <Input
                id="rule-end-date"
                type="datetime-local"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
              />
            </div>

            {/* Max Occurrences */}
            <div className="space-y-1">
              <Label htmlFor="rule-max-occurrences">Max Occurrences (optional)</Label>
              <Input
                id="rule-max-occurrences"
                type="number"
                min="1"
                value={formMaxOccurrences}
                onChange={(e) => setFormMaxOccurrences(e.target.value)}
                placeholder="Leave empty for unlimited"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRule ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      {/* Amortization type explanation modal */}
      <ResponsiveDialog
        open={amortizationModalOpen}
        onOpenChange={setAmortizationModalOpen}
        title="Amortization Types Explained"
      >
        <div className="space-y-4 py-2 text-sm">
          <div className="space-y-2">
            <h3 className="font-semibold text-base">French Amortization (Fixed Payment)</h3>
            <p>
              The most common type of mortgage amortization. Your monthly payment stays the
              <strong> same amount every month</strong> for the entire loan term.
            </p>
            <p className="text-muted-foreground">
              Each payment is split into interest and principal. Early payments are mostly interest;
              later payments are mostly principal. This means you pay more interest upfront but have
              predictable monthly payments.
            </p>
            <div className="bg-muted rounded-md p-3 text-xs space-y-1">
              <p className="font-medium">Example: $200,000 at 3.5% for 30 years</p>
              <p>→ Fixed monthly payment of <strong>$898.09</strong></p>
              <p>→ Month 1: <span className="text-destructive">$583.33 interest</span> + $314.76 principal</p>
              <p>→ Month 360: <span className="text-destructive">$2.60 interest</span> + $895.49 principal</p>
            </div>
          </div>
          <div className="border-t pt-4 space-y-2">
            <h3 className="font-semibold text-base">Italian Amortization (Decreasing Payment)</h3>
            <p>
              Your monthly payment <strong>decreases over time</strong>. The principal portion is the
              same every month, but the interest portion shrinks as the loan balance decreases.
            </p>
            <p className="text-muted-foreground">
              You pay less total interest compared to French amortization, but your early payments are
              higher. This is also called "straight-line" or "constant principal" amortization.
            </p>
            <div className="bg-muted rounded-md p-3 text-xs space-y-1">
              <p className="font-medium">Example: $200,000 at 3.5% for 30 years</p>
              <p>→ Principal portion: <strong>$555.56</strong> every month</p>
              <p>→ Month 1: <span className="text-destructive">$583.33 interest</span> + $555.56 principal = $1,138.89</p>
              <p>→ Month 360: <span className="text-destructive">$1.62 interest</span> + $555.56 principal = $557.18</p>
            </div>
          </div>
        </div>
      </ResponsiveDialog>

      {/* No accounts overlay */}
      <ResponsiveDialog open={noAccountsDialogOpen} onOpenChange={setNoAccountsDialogOpen} title="No Accounts Yet">
        <div className="space-y-4 text-center py-4">
          <p className="text-sm text-muted-foreground">
            You need at least one account before you can create a rule.
          </p>
          <Button onClick={() => { setNoAccountsDialogOpen(false); navigate("/accounts", { state: { openCreate: true } }); }}>
            Create an Account
          </Button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
