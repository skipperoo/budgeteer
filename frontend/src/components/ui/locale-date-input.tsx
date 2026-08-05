/**
 * LocaleDateInput — a native HTML date input whose *displayed* text follows the
 * app's stored locale (settings), not the browser's locale.
 *
 * Native <input type="date"> renders in the browser/OS locale format, which
 * ignores the app's locale setting (e.g. an Italian user sees mm/dd/yyyy on an
 * EN-OS browser). This component overlays a locale-formatted label on top of an
 * invisible native picker, so clicking opens the standard calendar but the text
 * shows dd/mm/yyyy (IT), mm/dd/yyyy (EN), etc.
 */

import React from "react";
import { getStoredLocale } from "@/lib/format";

export function formatDateInput(value: string): string {
  if (!value) return "";
  try {
    return new Date(value + "T12:00:00").toLocaleDateString(getStoredLocale(), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return value;
  }
}

interface LocaleDateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

export function LocaleDateInput({
  value,
  onChange,
  className = "",
  ...rest
}: LocaleDateInputProps) {
  return (
    <div
      className={`relative h-8 rounded-md border border-input bg-background text-foreground ${className}`}
    >
      {/* Formatted locale label behind (non-interactive). */}
      <span className="pointer-events-none absolute inset-0 flex items-center px-2 text-sm">
        {formatDateInput(value)}
      </span>
      {/* Native picker on top, transparent so the label shows through. */}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-full opacity-0 cursor-pointer"
        {...rest}
      />
    </div>
  );
}