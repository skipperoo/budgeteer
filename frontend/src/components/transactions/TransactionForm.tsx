import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoryType } from "@/stores/category-store";
import type { DocumentMetadata } from "@/types";

export interface TransactionFormData {
  accountId: string;
  type: "income" | "expense";
  amount: string;
  commission: string;
  interest_amount: string;
  date: string;
  category: string;
  counterparty: string;
  notes: string;
  file: File | null;
  documentsToDelete: string[];
  targetEmail?: string;
}

interface AccountOption {
  id: string;
  label: string;
}

interface TransactionFormProps {
  /** If set to a non-empty array, shows an account selector at the top */
  accounts?: AccountOption[];
  /** Pre-selected account ID (when accounts are given) or fixed account ID */
  accountId?: string;
  /** Pre-fill values (edit mode) */
  initialValues?: Partial<TransactionFormData>;
  /** Existing documents for the transaction (edit mode) */
  existingDocuments?: DocumentMetadata[];
  /** Category getter (from the category store) */
  getCategories: (type: CategoryType) => string[];
  /** Category creator (from the category store) — returns promise */
  addCategory: (type: CategoryType, name: string) => Promise<void>;
  /** Called with the final form data when the user clicks Save/Create */
  onSave: (data: TransactionFormData) => Promise<void>;
  /** Whether the save is in progress */
  saving?: boolean;
  /** Error message to display */
  error?: string;
  /** Label for the submit button (default "Create") */
  submitLabel?: string;
}

export function TransactionForm({
  accounts,
  accountId: initialAccountId,
  initialValues,
  existingDocuments,
  getCategories,
  addCategory,
  onSave,
  saving,
  error,
  submitLabel = "Create",
}: TransactionFormProps) {
  const [type, setType] = useState<"income" | "expense">(
    initialValues?.type ?? "expense"
  );
  const [amount, setAmount] = useState(initialValues?.amount ?? "");
  const [commission, setCommission] = useState(initialValues?.commission ?? "");
  const [interestAmount, setInterestAmount] = useState(initialValues?.interest_amount ?? "");
  const [date, setDate] = useState(
    initialValues?.date ?? new Date().toISOString().slice(0, 10)
  );
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [counterparty, setCounterparty] = useState(
    initialValues?.counterparty ?? ""
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [accountId, setAccountId] = useState(
    (accounts && accounts.length > 0
      ? initialAccountId ?? accounts[0].id
      : initialAccountId) ?? ""
  );
  const [file, setFile] = useState<File | null>(null);
  const [documentsToDelete, setDocumentsToDelete] = useState<string[]>([]);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [showSendTo, setShowSendTo] = useState(false);
  const [sendToEmail, setSendToEmail] = useState(initialValues?.targetEmail ?? "");

  const fileRef = useRef<HTMLInputElement>(null);

  // Reset category when type changes (different categories per type)
  useEffect(() => {
    if (!initialValues) {
      setCategory("");
      setShowCategoryInput(false);
    }
  }, [type, initialValues]);

  const handleAddNewCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    await addCategory(type as CategoryType, trimmed);
    setCategory(trimmed);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  const handleSubmit = () => {
    onSave({
      accountId,
      type,
      amount,
      commission,
      interest_amount: interestAmount,
      date,
      category,
      counterparty,
      notes,
      file,
      documentsToDelete,
      targetEmail: showSendTo && sendToEmail.trim() ? sendToEmail.trim() : undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Account selector (only when accounts prop is provided) */}
      {accounts && accounts.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Account</label>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setShowCategoryInput(false);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            required
          >
            <option value="">Select account...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Amount */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Amount</label>
        <div className="flex gap-2">
          <div className="flex rounded-md border border-input overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => { setType("expense"); if (!initialValues) { setCategory(""); setShowCategoryInput(false); } }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                type === "expense"
                  ? "bg-expense text-expense-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => { setType("income"); if (!initialValues) { setCategory(""); setShowCategoryInput(false); } }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                type === "income"
                  ? "bg-income text-income-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Income
            </button>
          </div>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              {type === "expense" ? "-" : "+"}
            </span>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="pl-7"
              required
            />
          </div>
        </div>
      </div>

      {/* Commission */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Commission / Fee (optional)</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={commission}
          onChange={(e) => setCommission(e.target.value)}
          placeholder="0.00"
        />
      </div>

      {/* Interest (only when the transaction has interest_amount — mortgage rules) */}
      {initialValues?.interest_amount != null && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Interest Paid</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={interestAmount}
            onChange={(e) => setInterestAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
      )}

      {/* Date */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Date</label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Category</label>
        {!showCategoryInput ? (
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setShowCategoryInput(true);
                } else {
                  setCategory(e.target.value);
                }
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Select category...</option>
              {getCategories(type as CategoryType).map((cat) => (
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

      {/* Counterparty */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Counterparty</label>
        <Input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="e.g. Store name, employer"
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
        />
      </div>

      {/* Send to user accordion */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowSendTo(!showSendTo)}
          className="flex w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <span>Send to</span>
          <svg
            className={`h-4 w-4 transition-transform ${showSendTo ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showSendTo && (
          <div className="space-y-2 pl-2 border-l-2 border-muted-foreground/20">
            <label className="text-sm font-medium">Recipient Email</label>
            <Input
              type="email"
              value={sendToEmail}
              onChange={(e) => setSendToEmail(e.target.value)}
              placeholder="user@example.com"
            />
            <p className="text-xs text-muted-foreground">
              The recipient will receive an invitation to accept this transfer into their account.
            </p>
          </div>
        )}
      </div>

      {/* Document upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Receipt / Document</label>
        <Input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
          }}
        />
        {file && (
          <p className="text-xs text-muted-foreground">
            {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      {/* Existing documents (edit mode) */}
      {existingDocuments && existingDocuments.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Current Documents</label>
          <div className="space-y-1">
            {existingDocuments.map((doc) => {
              const marked = documentsToDelete.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between text-xs p-2 rounded-md border ${
                    marked ? "border-destructive/50 bg-destructive/5 line-through text-muted-foreground" : "border-border"
                  }`}
                >
                  <span className="truncate">{doc.file_name}</span>
                  <Button
                    type="button"
                    variant={marked ? "outline" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-[10px] shrink-0 ml-2"
                    onClick={() => {
                      setDocumentsToDelete((prev) =>
                        marked
                          ? prev.filter((id) => id !== doc.id)
                          : [...prev, doc.id]
                      );
                    }}
                  >
                    {marked ? "Keep" : "Remove"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        className="w-full"
        disabled={saving || !accountId || !amount || !date}
      >
        {saving ? "Saving..." : submitLabel}
      </Button>
    </div>
  );
}
