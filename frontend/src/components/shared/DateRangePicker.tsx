/**
 * DateRangePicker — compact date range selector for the topbar.
 * Shows quick-select presets and native date inputs for custom ranges.
 */

import { useRef, useState, useEffect } from "react";
import { useDateRangeStore } from "@/stores/date-range-store";
import { LocaleDateInput } from "@/components/ui/locale-date-input";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

/* ─── Presets ─────────────────────────────────────────── */

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
] as const;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DateRangePicker() {
  const { range, setRange } = useDateRangeStore();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const isPresetActive = (days: number) =>
    range.start === daysAgo(days) && range.end === today();

  const handlePreset = (days: number) => {
    setRange({ start: daysAgo(days), end: today() });
    setOpen(false);
  };

  const handleShift = (dir: -1 | 1) => {
    const w = dateDiff(range.start, range.end);
    const newStart = dateShift(range.start, w * dir);
    const newEnd = dateShift(range.end, w * dir);
    setRange({ start: newStart, end: newEnd });
  };

  return (
    <div className="relative flex items-center gap-1.5" ref={panelRef}>
      {/* Quick presets */}
      <div className="hidden sm:flex items-center gap-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => handlePreset(p.days)}
            className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors cursor-pointer ${
              isPresetActive(p.days)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Nudge buttons */}
      <button
        onClick={() => handleShift(-1)}
        className="p-1 rounded-md text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors cursor-pointer"
        aria-label="Move window backward"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => handleShift(1)}
        className="p-1 rounded-md text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-colors cursor-pointer"
        aria-label="Move window forward"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {/* Date display — opens custom panel */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors cursor-pointer"
      >
        <Calendar className="h-3.5 w-3.5" />
        <span className="tabular-nums whitespace-nowrap">
          {formatRange(range.start, range.end)}
        </span>
      </button>

      {/* Custom date panel */}
      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-50 bg-card border border-border/50 shadow-sm rounded-lg p-3 w-[260px]">
          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">From</span>
              <LocaleDateInput
                value={range.start}
                onChange={(v) => setRange({ ...range, start: v })}
                className="h-8"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">To</span>
              <LocaleDateInput
                value={range.end}
                onChange={(v) => setRange({ ...range, end: v })}
                max={today()}
                className="h-8"
              />
            </label>
            <div className="flex gap-1.5 pt-1">
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => handlePreset(p.days)}
                  className="flex-1 py-1.5 text-[10px] font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────── */

function formatRange(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (s.getFullYear() !== e.getFullYear()) {
    (opts as any).year = "numeric";
  }
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

function dateDiff(a: string, b: string): number {
  const da = new Date(a + "T12:00:00");
  const db = new Date(b + "T12:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function dateShift(date: string, days: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
