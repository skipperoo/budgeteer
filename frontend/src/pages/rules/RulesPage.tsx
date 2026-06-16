import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRuleStore, type Rule, type CreateRuleRequest } from "@/stores/rule-store";
import { encryptForRecipient } from "@/lib/crypto-rules";
import { formatDate } from "@/lib/format";
import { Trash2, Plus, Pencil, Loader2, AlertCircle } from "lucide-react";

type RuleType = "payment" | "transfer" | "user_transfer";

interface RuleFormData {
  name: string;
  type: RuleType;
  amount: string;
  sourceAccountId: string;
  targetAccountId: string;
  targetUserId: string;
  categoryId: string;
  notes: string;
  counterparty: string;
  frequency: string;
  nextOccurrence: string;
  endDate: string;
  maxOccurrences: string;
}

const emptyForm: RuleFormData = {
  name: "",
  type: "payment",
  amount: "",
  sourceAccountId: "",
  targetAccountId: "",
  targetUserId: "",
  categoryId: "",
  notes: "",
  counterparty: "",
  frequency: "monthly",
  nextOccurrence: "",
  endDate: "",
  maxOccurrences: "",
};

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

  const [open, setOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState<RuleFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!serverPublicKey) {
      fetchServerPublicKey().catch(() => {});
    }
    fetchRules();
  }, []);

  const openCreate = useCallback(() => {
    setEditingRule(null);
    setForm({
      ...emptyForm,
      nextOccurrence: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    });
    setFormError(null);
    setOpen(true);
  }, []);

  const openEdit = useCallback((rule: Rule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      type: "payment",
      amount: "",
      sourceAccountId: "",
      targetAccountId: "",
      targetUserId: "",
      categoryId: "",
      notes: "",
      counterparty: "",
      frequency: rule.frequency,
      nextOccurrence: new Date(rule.next_occurrence).toISOString().slice(0, 16),
      endDate: rule.end_date
        ? new Date(rule.end_date).toISOString().slice(0, 16)
        : "",
      maxOccurrences: rule.max_occurrences?.toString() ?? "",
    });
    setFormError(null);
    setOpen(true);
  }, []);

  const handleSave = async () => {
    setFormError(null);

    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setFormError("Amount must be positive");
      return;
    }
    if (!form.nextOccurrence) {
      setFormError("Next occurrence is required");
      return;
    }
    if (!form.sourceAccountId.trim()) {
      setFormError("Source account is required");
      return;
    }
    if (
      (form.type === "transfer" || form.type === "user_transfer") &&
      !form.targetAccountId.trim()
    ) {
      setFormError("Target account is required for transfers");
      return;
    }
    if (form.type === "user_transfer" && !form.targetUserId.trim()) {
      setFormError("Target user is required for user transfers");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: form.type,
        amount: parseFloat(form.amount),
        source_account_id: form.sourceAccountId,
        target_account_id:
          form.type === "transfer" || form.type === "user_transfer"
            ? form.targetAccountId
            : undefined,
        target_user_id:
          form.type === "user_transfer" ? form.targetUserId : undefined,
        category_id: form.categoryId || undefined,
        notes: form.notes || undefined,
        counterparty: form.counterparty || undefined,
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

      const nextOccurrence = new Date(form.nextOccurrence).toISOString();

      if (editingRule) {
        await updateRule(editingRule.id, {
          name: form.name.trim(),
          encrypted_payload: encryptedPayload,
          frequency: form.frequency,
          next_occurrence: nextOccurrence,
          end_date: form.endDate
            ? new Date(form.endDate).toISOString()
            : null,
          max_occurrences: form.maxOccurrences
            ? parseInt(form.maxOccurrences, 10)
            : undefined,
        });
      } else {
        const req: CreateRuleRequest = {
          name: form.name.trim(),
          encrypted_payload: encryptedPayload,
          frequency: form.frequency,
          next_occurrence: nextOccurrence,
          end_date: form.endDate
            ? new Date(form.endDate).toISOString()
            : undefined,
          max_occurrences: form.maxOccurrences
            ? parseInt(form.maxOccurrences, 10)
            : undefined,
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
      case "once": return "Once";
      case "daily": return "Daily";
      case "weekly": return "Weekly";
      case "monthly": return "Monthly";
      case "yearly": return "Yearly";
      default: return freq;
    }
  };

  const typeOptions: { value: RuleType; label: string }[] = [
    { value: "payment", label: "Payment" },
    { value: "transfer", label: "Transfer (your accounts)" },
    { value: "user_transfer", label: "Transfer (to another user)" },
  ];

  const freqOptions = [
    { value: "once", label: "Once" },
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frequency</span>
                    <span>{getFrequencyLabel(rule.frequency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next</span>
                    <span>{formatDate(rule.next_occurrence)}</span>
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
            <div className="space-y-1">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Rent, Netflix, Savings transfer..."
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-type">Type</Label>
              <select
                id="rule-type"
                value={form.type}
                disabled={!!editingRule}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as RuleType })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {typeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-amount">Amount</Label>
              <Input
                id="rule-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="100.00"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-source">Source Account ID</Label>
              <Input
                id="rule-source"
                value={form.sourceAccountId}
                onChange={(e) =>
                  setForm({ ...form, sourceAccountId: e.target.value })
                }
                placeholder="Account UUID"
              />
            </div>

            {(form.type === "transfer" ||
              form.type === "user_transfer") && (
              <div className="space-y-1">
                <Label htmlFor="rule-target-account">Target Account ID</Label>
                <Input
                  id="rule-target-account"
                  value={form.targetAccountId}
                  onChange={(e) =>
                    setForm({ ...form, targetAccountId: e.target.value })
                  }
                  placeholder="Account UUID"
                />
              </div>
            )}

            {form.type === "user_transfer" && (
              <div className="space-y-1">
                <Label htmlFor="rule-target-user">Target User ID</Label>
                <Input
                  id="rule-target-user"
                  value={form.targetUserId}
                  onChange={(e) =>
                    setForm({ ...form, targetUserId: e.target.value })
                  }
                  placeholder="User UUID"
                />
              </div>
            )}

            {form.type === "payment" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="rule-category">Category ID (optional)</Label>
                  <Input
                    id="rule-category"
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm({ ...form, categoryId: e.target.value })
                    }
                    placeholder="Category UUID"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rule-counterparty">Counterparty (optional)</Label>
                  <Input
                    id="rule-counterparty"
                    value={form.counterparty}
                    onChange={(e) =>
                      setForm({ ...form, counterparty: e.target.value })
                    }
                    placeholder="Landlord, Netflix, etc."
                  />
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label htmlFor="rule-notes">Notes (optional)</Label>
              <Input
                id="rule-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Monthly rent payment"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-frequency">Frequency</Label>
              <select
                id="rule-frequency"
                value={form.frequency}
                onChange={(e) =>
                  setForm({ ...form, frequency: e.target.value })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {freqOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-first-occurrence">First Occurrence</Label>
              <Input
                id="rule-first-occurrence"
                type="datetime-local"
                value={form.nextOccurrence}
                onChange={(e) =>
                  setForm({ ...form, nextOccurrence: e.target.value })
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-end-date">End Date (optional)</Label>
              <Input
                id="rule-end-date"
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="rule-max-occurrences">Max Occurrences (optional)</Label>
              <Input
                id="rule-max-occurrences"
                type="number"
                min="1"
                value={form.maxOccurrences}
                onChange={(e) =>
                  setForm({ ...form, maxOccurrences: e.target.value })
                }
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
