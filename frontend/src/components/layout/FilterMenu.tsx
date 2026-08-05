/**
 * FilterMenu — dropdown panel in the header with date-range quick presets,
 * category multi-select, and transaction-type checkboxes.
 *
 * Placed to the right of the notification bell.
 */

import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Filter, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleDateInput } from "@/components/ui/locale-date-input";
import { formatDateLabel } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
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

/** First day of the current month ("YYYY-MM-01"). */
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Monday of the current week ("YYYY-MM-DD"). */
function mondayOfThisWeek(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const mondayOffset = (day + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - mondayOffset);
  return monday.toISOString().slice(0, 10);
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

export function FilterMenu() {
  const location = useLocation();
  // Only show on Dashboard and AccountDetail pages
  const showOnRoutes = ["/dashboard", "/accounts/"];
  const isVisible = showOnRoutes.some((route) => location.pathname.startsWith(route));

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Date range
  const { range, setRange } = useDateRangeStore();

  // Category + type filters
  const { selectedCategories, selectedTypes, toggleCategory, toggleType, resetFilters } =
    useFilterStore();

  // Categories — trigger lazy load on mount
  const { items: categoryItems, fetchCategories, loaded: categoriesLoaded } = useCategoryStore();
  useEffect(() => {
    if (!categoriesLoaded) {
      fetchCategories();
    }
  }, [categoriesLoaded, fetchCategories]);

  // Exclude disabled categories from the filter dropdown
  const allCategories = [
    ...new Set(
      categoryItems
        .filter((c) => !c.is_disabled)
        .map((c) => c.name)
    ),
  ].sort((a, b) => a.localeCompare(b));

  // Custom date range inputs
  const [customStart, setCustomStart] = useState(range.start);
  const [customEnd, setCustomEnd] = useState(range.end);

  // Sync custom inputs when range changes externally
  useEffect(() => {
    setCustomStart(range.start);
    setCustomEnd(range.end);
  }, [range]);

  // Close on outside click — ignore clicks inside portaled content (Radix menus)
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside any Radix portaled content
      if (target.closest('[data-radix-collection-item]') || target.closest('[data-radix-popper-content-wrapper]')) {
        return;
      }
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        btnRef.current &&
        !btnRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick, true);
    return () => document.removeEventListener("mousedown", handleClick, true);
  }, [open]);

  const handleQuickPreset = (days: number) => {
    setRange({ start: daysAgo(days), end: today() });
  };

  const handleThisMonth = () => {
    setRange({ start: firstOfMonth(), end: today() });
  };

  const handleThisWeek = () => {
    setRange({ start: mondayOfThisWeek(), end: today() });
  };

  // Apply custom range when the second date is selected (both are set)
  const applyCustomIfReady = (start: string, end: string) => {
    if (start && end) {
      setRange({ start, end });
    }
  };

  const activeFilterCount =
    selectedCategories.length + selectedTypes.length;

  if (!isVisible) return null;

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
              {formatDateLabel(range.start, range.end)}
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
            <div className="flex gap-1.5 pt-1.5">
              <button
                type="button"
                onClick={handleThisMonth}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md border transition-colors ${
                  range.start === firstOfMonth() && range.end === today()
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-transparent text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                }`}
              >
                This month
              </button>
              <button
                type="button"
                onClick={handleThisWeek}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md border transition-colors ${
                  range.start === mondayOfThisWeek() && range.end === today()
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-transparent text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                }`}
              >
                This week
              </button>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <LocaleDateInput
                value={customStart}
                onChange={(v) => {
                  setCustomStart(v);
                  if (v && customEnd) applyCustomIfReady(v, customEnd);
                }}
                className="flex-1 h-7"
              />
              <span className="text-s text-muted-foreground shrink-0">→</span>
              <LocaleDateInput
                value={customEnd}
                onChange={(v) => {
                  setCustomEnd(v);
                  if (customStart && v) applyCustomIfReady(customStart, v);
                }}
                className="flex-1 h-7"
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
            {allCategories.length === 0 && !categoriesLoaded ? (
              <p className="text-xs text-muted-foreground italic">Loading categories...</p>
            ) : allCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No categories yet. Create a transaction to see categories.</p>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs font-normal">
                    {selectedCategories.length > 0
                      ? `${selectedCategories.length} selected`
                      : "All categories"}
                    <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-48 overflow-y-auto w-72" align="start">
                  {allCategories.map((cat) => (
                    <DropdownMenuCheckboxItem
                      key={cat}
                      checked={selectedCategories.includes(cat)}
                      onCheckedChange={() => toggleCategory(cat)}
                      onSelect={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      {cat}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
