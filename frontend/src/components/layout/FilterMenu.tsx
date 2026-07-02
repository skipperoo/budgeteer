/**
 * FilterMenu — dropdown panel in the header with date-range quick presets,
 * category multi-select, and transaction-type checkboxes.
 *
 * Placed to the right of the notification bell.
 */

import { useState, useRef, useEffect } from "react";
import { Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDateRangeStore } from "@/stores/date-range-store";
import { useFilterStore } from "@/stores/filter-store";
import { useCategoryStore } from "@/stores/category-store";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const QUICK_PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

const TYPE_OPTIONS = [
  { value: "income" as const, label: "Income" },
  { value: "expense" as const, label: "Expense" },
  { value: "transfer" as const, label: "Transfer" },
];

function formatDateLabel(range: { start: string; end: string }): string {
  const s = new Date(range.start + "T12:00:00");
  const e = new Date(range.end + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

export function FilterMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Date range
  const { range, setRange } = useDateRangeStore();

  // Category + type filters
  const { selectedCategories, selectedTypes, toggleCategory, toggleType, setSelectedCategories, resetFilters } =
    useFilterStore();

  // All categories from the store (merged income + expense)
  const { items: categoryItems } = useCategoryStore();
  const allCategories = [
    ...new Set(categoryItems.map((c) => c.name)),
  ].sort((a, b) => a.localeCompare(b));

  // Custom date range inputs
  const [customStart, setCustomStart] = useState(range.start);
  const [customEnd, setCustomEnd] = useState(range.end);

  // Sync custom inputs when range changes externally
  useEffect(() => {
    setCustomStart(range.start);
    setCustomEnd(range.end);
  }, [range]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleQuickPreset = (days: number) => {
    setRange({ start: daysAgo(days), end: today() });
  };

  // Apply custom range when the second date is selected (both are set)
  const applyCustomIfReady = (start: string, end: string) => {
    if (start && end) {
      setRange({ start, end });
    }
  };

  const activeFilterCount =
    selectedCategories.length + selectedTypes.length;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={`relative p-2 rounded-md transition-all cursor-pointer ${
          open || activeFilterCount > 0
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
        }`}
        aria-label="Filters"
      >
        <Filter className="h-5 w-5" />
        {activeFilterCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-0.5">
            {activeFilterCount > 9 ? "9+" : activeFilterCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 z-50 w-80 bg-card border border-border/50 rounded-xl shadow-xl p-4 space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Filters</span>
            <div className="flex items-center gap-1">
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    resetFilters();
                    setRange({ start: daysAgo(30), end: today() });
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Date Range ── */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Date Range
            </span>
            <p className="text-xs text-foreground font-medium">
              {formatDateLabel(range)}
            </p>
            <div className="flex gap-1.5">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => handleQuickPreset(preset.days)}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md border transition-colors ${
                    range.start === daysAgo(preset.days) && range.end === today()
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-transparent text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <Input
                type="date"
                value={customStart}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomStart(v);
                  if (v && customEnd) applyCustomIfReady(v, customEnd);
                }}
                className="h-7 text-[11px] min-w-0 flex-1"
              />
              <span className="text-xs text-muted-foreground shrink-0">→</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomEnd(v);
                  if (customStart && v) applyCustomIfReady(customStart, v);
                }}
                className="h-7 text-[11px] min-w-0 flex-1"
              />
            </div>
          </div>

          {/* ── Transaction Type ── */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Type
            </span>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const active = selectedTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleType(opt.value)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                      active
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-transparent text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Category ── */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Category
            </span>
            {allCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No categories available.</p>
            ) : (
              <select
                multiple
                value={selectedCategories}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                  setSelectedCategories(selected);
                }}
                className="w-full h-32 rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                <option value="" disabled>
                  Select categories...
                </option>
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-muted-foreground">
              {selectedCategories.length > 0
                ? `${selectedCategories.length} selected`
                : "None selected — shows all"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
