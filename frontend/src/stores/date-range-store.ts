/**
 * DateRangeStore — shared date-range state used by the header's
 * DateRangePicker and consumed by dashboard / account charts.
 *
 * Defaults to the last 30 days (today – 30 days → today).
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
  /** Reset to the default 30-day window ending today. */
  resetToDefault: () => void;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultRange: DateRange = { start: daysAgo(30), end: today() };

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
