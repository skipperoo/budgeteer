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
import { IconPicker } from "@/components/shared/IconPicker";
import { getCuratedIcon } from "@/lib/curated-icons";
import { Plus, Trash2, Eye, EyeOff, Palette } from "lucide-react";

export function CategoryManagementSection() {
  const { items, loaded, loading, fetchCategories, addCategory, updateCategory, removeCategoryById } = useCategoryStore();
  const [expanded, setExpanded] = useState(false);

  // Add category form
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [adding, setAdding] = useState(false);

  // Editing state — track which category is being renamed
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

  const handleDelete = useCallback(async (id: string) => {
    // Double-check with the user
    const cat = items.find((c) => c.id === id);
    if (!cat) return;
    if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    await removeCategoryById(id);
  }, [items, removeCategoryById]);

  const handleToggleDisabled = useCallback(async (id: string, current: boolean) => {
    await updateCategory(id, { is_disabled: !current });
  }, [updateCategory]);

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
          {/* Add new category */}
          <div className="space-y-3 p-4 rounded-lg border border-border/50 bg-secondary/20">
            <h4 className="text-sm font-semibold">Add New Category</h4>
            <div className="flex gap-2">
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
            </div>
            <div className="flex gap-2">
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
                  onToggleDisabled={() => handleToggleDisabled(cat.id, cat.is_disabled)}
                  onDelete={() => handleDelete(cat.id)}
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
                  onToggleDisabled={() => handleToggleDisabled(cat.id, cat.is_disabled)}
                  onDelete={() => handleDelete(cat.id)}
                />
              ))}
            </div>
          )}

          {/* Disabled categories */}
          {items.some((c) => c.is_disabled) && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Disabled ({items.filter((c) => c.is_disabled).length})
              </h4>
              {items.filter((c) => c.is_disabled).map((cat) => (
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
                  onToggleDisabled={() => handleToggleDisabled(cat.id, cat.is_disabled)}
                  onDelete={() => handleDelete(cat.id)}
                />
              ))}
            </div>
          )}

          {!loading && items.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              No categories yet. Create one above.
            </p>
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
  onToggleDisabled: () => void;
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
  onToggleDisabled,
  onDelete,
}: CategoryRowProps) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const isEditing = editingName === category.id;
  const IconComponent = category.icon ? getCuratedIcon(category.icon) : null;

  return (
    <div
      className={`
        flex items-center gap-2 p-2 rounded-lg border transition-all
        ${category.is_disabled
          ? "border-border/30 bg-muted/30 opacity-60"
          : "border-border/50 bg-card hover:border-border"
        }
      `}
    >
      {/* Color dot */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="w-5 h-5 rounded-full border border-border/50 cursor-pointer hover:ring-1 hover:ring-ring transition-all"
          style={{ backgroundColor: category.color || "var(--muted-foreground)" }}
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

      {/* Toggle disabled */}
      <button
        type="button"
        onClick={onToggleDisabled}
        className={`p-1 rounded-md transition-colors ${
          category.is_disabled
            ? "text-muted-foreground hover:text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title={category.is_disabled ? "Enable category" : "Disable category"}
      >
        {category.is_disabled ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
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
