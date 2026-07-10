/**
 * CategoryManagementSection — accordion card for managing categories.
 *
 * Allows the user to:
 * - Add new categories (with type selection)
 * - Rename existing categories
 * - Set a fixed color via a native color picker
 * - Set an icon via the IconPicker
 * - Enable/disable categories (hides them from dropdowns/pie charts)
 * - Delete categories
 *
 * Placed between "General" and "Appearance" in the settings page.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useCategoryStore } from "@/stores/category-store";
import { useAuthStore } from "@/stores/auth-store";
import { useAccountStore } from "@/stores/account-store";
import { IconPicker } from "@/components/shared/IconPicker";
import { getCuratedIcon } from "@/lib/curated-icons";
import { bytesToBase64 } from "@/lib/crypto";
import { encryptTransactionPayload, decryptTransactionPayload } from "@/lib/crypto-transaction";
import { decryptECIESPayload } from "@/lib/crypto-rules";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { getAccountKey } from "@/lib/decrypt-transactions";
import type { Transaction, CreateTransactionRequest } from "@/types";
import { Plus, Trash2, Pencil, Palette } from "lucide-react";

export function CategoryManagementSection() {
  const { items, loaded, loading, fetchCategories, addCategory, updateCategory, removeCategoryById } = useCategoryStore();

  // Global icons toggle — stored in localStorage
  const [iconsEnabled, setIconsEnabled] = useState(() => {
    try {
      return localStorage.getItem("budgeteer_categories_show_icons") !== "false";
    } catch { return true; }
  });

  // Persist icons preference
  const handleIconsToggle = (enabled: boolean) => {
    setIconsEnabled(enabled);
    try {
      localStorage.setItem("budgeteer_categories_show_icons", String(enabled));
      // Dispatch a custom event so CategoryPieChart picks up the change
      window.dispatchEvent(new CustomEvent("icons-toggle", { detail: { enabled } }));
    } catch { /* ignore */ }
  };
  const [expanded, setExpanded] = useState(false);

  // Add category form
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [adding, setAdding] = useState(false);

  // Editing state — track which category is being renamed
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState("");

  useEffect(() => {
    if (expanded && !loaded && !loading) {
      fetchCategories();
    }
  }, [expanded, loaded, loading, fetchCategories]);

  const handleAdd = useCallback(async () => {
    const trimmed = newName.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    await addCategory(newType, trimmed);
    setNewName("");
    setAdding(false);
  }, [newName, newType, adding, addCategory]);

  const handleDeleteStart = useCallback((id: string) => {
    const cat = items.find((c) => c.id === id);
    if (!cat) return;
    setDeleteTarget({ id: cat.id, name: cat.name });
  }, [items]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingInProgress(true);
    setDeleteProgress(`Re-categorizing transactions from "${deleteTarget.name}" to "General"...`);

    try {
      const oldCategory = deleteTarget.name;

      // Gather all accounts
      const accounts = useAccountStore.getState().accounts;
      if (accounts.length === 0) {
        // No accounts — just delete the category
        await removeCategoryById(deleteTarget.id);
        setDeleteTarget(null);
        setDeletingInProgress(false);
        setDeleteProgress("");
        return;
      }

      const privKey = useAuthStore.getState().plaintextPrivateKey;
      const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
      const userPubKey = useAuthStore.getState().user?.public_key;

      let updatedCount = 0;

      for (const acc of accounts) {
        let accountKey: string;
        try {
          accountKey = await getAccountKey(acc.id, privKeyBase64 ?? undefined, userPubKey);
        } catch {
          continue; // skip accounts we can't access
        }

        // Fetch all transactions for this account
        const txs = await apiFetch<Transaction[]>(ENDPOINTS.transactions(acc.id));
        if (!txs || txs.length === 0) continue;

        for (const tx of txs) {
          try {
            let payload: { category: string };

            if (tx.encrypted_payload.startsWith("1|")) {
              if (!privKeyBase64) continue;
              payload = await decryptECIESPayload<{ category: string }>(
                tx.encrypted_payload,
                privKeyBase64,
              );
            } else {
              payload = await decryptTransactionPayload(
                tx.encrypted_payload,
                accountKey,
              );
            }

            if (payload.category === oldCategory) {
              payload.category = "General";
              const reEncrypted = await encryptTransactionPayload(payload as any, accountKey);
              await apiFetch<Transaction>(ENDPOINTS.transaction(tx.id), {
                method: "PUT",
                body: JSON.stringify({
                  time: tx.time,
                  encrypted_payload: reEncrypted,
                } as CreateTransactionRequest),
              });
              updatedCount++;
            }
          } catch {
            // Skip transactions we can't decrypt
          }
        }
      }

      setDeleteProgress(`Updated ${updatedCount} transaction${updatedCount !== 1 ? "s" : ""}. Deleting category...`);
      await removeCategoryById(deleteTarget.id);

      setDeleteTarget(null);
      setDeletingInProgress(false);
      setDeleteProgress("");
    } catch (err) {
      setDeletingInProgress(false);
      setDeleteProgress(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [deleteTarget, removeCategoryById]);

  const handleDeleteCancel = useCallback(() => {
    if (!deletingInProgress) {
      setDeleteTarget(null);
      setDeleteProgress("");
    }
  }, [deletingInProgress]);

  const handleColorChange = useCallback(async (id: string, color: string | null) => {
    await updateCategory(id, { color });
  }, [updateCategory]);

  const handleIconChange = useCallback(async (id: string, icon: string | null) => {
    await updateCategory(id, { icon });
  }, [updateCategory]);

  const handleRename = useCallback(async (id: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingName(null);
      return;
    }
    await updateCategory(id, { name: trimmed });
    setEditingName(null);
  }, [editValue, updateCategory]);

  const incomeCategories = items.filter((c) => c.type === "income");
  const expenseCategories = items.filter((c) => c.type === "expense");

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle>Categories</CardTitle>
          <span className="text-xs text-muted-foreground">
            {items.length} categor{items.length !== 1 ? "ies" : "y"}
            {expanded ? " ▲" : " ▼"}
          </span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6">
          {/* Global icons toggle */}
          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2">
            <span className="text-sm font-medium">Show category icons in charts</span>
            <button
              type="button"
              role="switch"
              aria-checked={iconsEnabled}
              onClick={() => handleIconsToggle(!iconsEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                iconsEnabled ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transform ring-0 transition duration-200 ease-in-out ${
                  iconsEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Add new category */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-input overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => setNewType("expense")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  newType === "expense"
                    ? "bg-expense text-expense-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setNewType("income")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  newType === "income"
                    ? "bg-income text-income-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Income
              </button>
            </div>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAdd} disabled={adding || !newName.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>

          {/* Loading state */}
          {loading && <p className="text-xs text-muted-foreground italic">Loading categories...</p>}

          {/* Income categories */}
          {incomeCategories.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-income">
                Income ({incomeCategories.length})
              </h4>
              {incomeCategories.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  editingName={editingName}
                  editValue={editValue}
                  onStartEdit={() => { setEditingName(cat.id); setEditValue(cat.name); }}
                  onEditValueChange={setEditValue}
                  onSaveRename={() => handleRename(cat.id)}
                  onCancelRename={() => setEditingName(null)}
                  onColorChange={(color) => handleColorChange(cat.id, color)}
                  onIconChange={(icon) => handleIconChange(cat.id, icon)}
                  onDelete={() => handleDeleteStart(cat.id)}
                />
              ))}
            </div>
          )}

          {/* Expense categories */}
          {expenseCategories.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-expense">
                Expense ({expenseCategories.length})
              </h4>
              {expenseCategories.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  editingName={editingName}
                  editValue={editValue}
                  onStartEdit={() => { setEditingName(cat.id); setEditValue(cat.name); }}
                  onEditValueChange={setEditValue}
                  onSaveRename={() => handleRename(cat.id)}
                  onCancelRename={() => setEditingName(null)}
                  onColorChange={(color) => handleColorChange(cat.id, color)}
                  onIconChange={(icon) => handleIconChange(cat.id, icon)}
                  onDelete={() => handleDeleteStart(cat.id)}
                />
              ))}
            </div>
          )}

          {!loading && items.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              No categories yet. Create one above.
            </p>
          )}

          {/* Delete confirmation dialog */}
          {deleteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="mx-4 w-full max-w-md rounded-lg bg-card p-6 elevated">
                <h3 className="mb-2 text-lg font-semibold text-destructive">Delete Category</h3>
                <p className="mb-2 text-sm text-muted-foreground">
                  This will delete the category <strong>"{deleteTarget.name}"</strong> and
                  move all transactions using it to <strong>"General"</strong>.
                </p>
                <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
                  <strong>Note:</strong> All affected transactions will be decrypted, updated,
                  and re-encrypted. This may take a while if you have many transactions.
                </p>
                {deleteProgress && (
                  <p className="mb-3 text-sm text-muted-foreground italic">{deleteProgress}</p>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleDeleteCancel}
                    disabled={deletingInProgress}
                    className="rounded-md bg-card px-4 py-2 text-sm font-medium border border-input hover:bg-secondary disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={deletingInProgress}
                    className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {deletingInProgress ? "Working..." : "Delete Category"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Category Row Sub-component ──────────────────────────────────────────

interface CategoryRowProps {
  category: { id: string; name: string; color?: string | null; icon?: string | null; is_disabled: boolean };
  editingName: string | null;
  editValue: string;
  onStartEdit: () => void;
  onEditValueChange: (v: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onColorChange: (color: string | null) => void;
  onIconChange: (icon: string | null) => void;
  onDelete: () => void;
}

function CategoryRow({
  category,
  editingName,
  editValue,
  onStartEdit,
  onEditValueChange,
  onSaveRename,
  onCancelRename,
  onColorChange,
  onIconChange,
  onDelete,
}: CategoryRowProps) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const isEditing = editingName === category.id;
  const IconComponent = category.icon ? getCuratedIcon(category.icon) : null;
  // Use the store's getCategoryColor which falls back to a deterministic default
  const displayColor = useCategoryStore.getState().getCategoryColor(category.name);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-card hover:border-border transition-all">
      {/* Color dot */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="w-5 h-5 rounded-full border border-border/50 cursor-pointer hover:ring-1 hover:ring-ring transition-all"
          style={{ backgroundColor: displayColor }}
          title="Change color"
        />
        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border/50 rounded-lg p-2 shadow-lg">
            <input
              type="color"
              value={category.color || "#3B82F6"}
              onChange={(e) => onColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 p-0"
            />
          </div>
        )}
      </div>

      {/* Icon */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowIconPicker(!showIconPicker)}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-border/50 hover:bg-secondary/50 transition-all cursor-pointer"
          title="Choose icon"
        >
          {IconComponent ? (
            <IconComponent className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Palette className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        {showIconPicker && (
          <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-card border border-border/50 rounded-lg p-2 shadow-lg">
            <IconPicker
              value={category.icon}
              onChange={(icon) => { onIconChange(icon); setShowIconPicker(false); }}
            />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <form
            onSubmit={(e) => { e.preventDefault(); onSaveRename(); }}
            className="flex gap-1"
          >
            <Input
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              className="h-7 text-xs px-2"
              autoFocus
              onBlur={onCancelRename}
            />
            <Button type="submit" size="sm" className="h-7 px-2 text-[10px]">
              Save
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            className="text-sm font-medium truncate block w-full text-left hover:underline underline-offset-2"
            title="Click to rename"
          >
            {category.name}
          </button>
        )}
      </div>

      {/* Edit button — triggers inline rename */}
      <button
        type="button"
        onClick={onStartEdit}
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        title="Rename category"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete category"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
