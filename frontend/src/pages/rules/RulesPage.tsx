import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRuleStore, type Rule, type CreateRuleRequest } from "@/stores/rule-store";
import { useAccountStore } from "@/stores/account-store";
import { useCategoryStore, type CategoryType } from "@/stores/category-store";
import { encryptForRecipient } from "@/lib/crypto-rules";
import { formatDate, formatDateTimeWithOffset, utcToLocalDatetime, getGMTOffset } from "@/lib/format";
import { Trash2, Plus, Pencil, Loader2, AlertCircle } from "lucide-react";

type RuleType = "payment" | "income" | "transfer" | "user_transfer";

export default function RulesPage() {
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
    if (!formAmount || parseFloat(formAmount) <= 0) {
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

    setSaving(true);
    try {
      const commission = formCommission ? parseFloat(formCommission) : 0;
      const payload = {
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
        <Button onClick={openCreate}>
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
                }}
                className={selectStyles}
              >
                <option value="payment">Payment</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer (your accounts)</option>
                <option value="user_transfer">Transfer (to another user)</option>
              </select>
            </div>

            {/* Amount */}
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
                onChange={(e) => setFormFrequency(e.target.value)}
                className={selectStyles}
              >
                {freqOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
    </div>
  );
}
