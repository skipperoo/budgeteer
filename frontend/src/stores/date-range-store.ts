/**
 * DateRangeStore — shared date-range state used by the header's
 * DateRangePicker and consumed by dashboard / account charts.
 *
 * Defaults to the current month (1st of month → today).
 */

import { create } from "zustand";

export interface DateRange {
  start: string; // ISO date string "YYYY-MM-DD"
  end: string;   // ISO date string "YYYY-MM-DD"
}

interface DateRangeState {
  range: DateRange;
  setRange: (range: DateRange) => void;
  /** Convenience: shift the window by `days` (preserving width). */
  shiftDays: (days: number) => void;
  /** Reset to the default current-month window ending today. */
  resetToDefault: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const defaultRange: DateRange = { start: firstOfMonth(), end: today() };

export const useDateRangeStore = create<DateRangeState>((set, get) => ({
  range: defaultRange,

  setRange: (range) => set({ range }),

  shiftDays: (days) => {
    const { start, end } = get().range;
    const startDate = new Date(start + "T12:00:00");
    const endDate = new Date(end + "T12:00:00");
    startDate.setDate(startDate.getDate() + days);
    endDate.setDate(endDate.getDate() + days);
    set({
      range: {
        start: startDate.toISOString().slice(0, 10),
        end: endDate.toISOString().slice(0, 10),
      },
    });
  },

  resetToDefault: () => set({ range: defaultRange }),
}));
