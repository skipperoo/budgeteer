/**
 * Toast — lightweight shadcn-style notification component.
 *
 * Usage:
 *   import { toast } from "@/components/ui/toast";
 *   toast({ title: "Done", description: "Migration completed", variant: "success" });
 *
 * To render the toast container, add <Toaster /> to the app root (main.tsx).
 */

import React, { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ToastProps {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "error" | "info";
  duration?: number; // ms, default 5000
}

type Listener = (toasts: ToastProps[]) => void;

// ─── Store (simple pub/sub, no external dependency) ───────────────────────

let toasts: ToastProps[] = [];
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener([...toasts]);
  }
}

let nextId = 0;

export function toast(opts: Omit<ToastProps, "id">) {
  const id = `toast-${nextId++}`;
  const t: ToastProps = { ...opts, id, duration: opts.duration ?? 5000 };
  toasts = [...toasts, t];
  notify();

  // Auto-dismiss
  if (t.duration !== undefined && t.duration > 0) {
    setTimeout(() => dismiss(id), t.duration);
  }
  return id;
}

export function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function dismissAll() {
  toasts = [];
  notify();
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useToast() {
  const [state, setState] = useState<ToastProps[]>(toasts);

  useEffect(() => {
    const listener: Listener = (updated) => setState(updated);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return { toasts: state, toast, dismiss, dismissAll };
}

// ─── Components ───────────────────────────────────────────────────────────

const variantStyles: Record<string, string> = {
  default: "bg-card border-border/50 text-foreground",
  success: "bg-green-50 border-green-300 text-green-800 dark:bg-green-950 dark:border-green-700 dark:text-green-200",
  error: "bg-red-50 border-red-300 text-red-800 dark:bg-red-950 dark:border-red-700 dark:text-red-200",
  info: "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200",
};

function ToastItem({ t, onClose }: { t: ToastProps; onClose: () => void }) {
  return (
    <div
      className={`
        pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg
        animate-in slide-in-from-top-2 fade-in duration-200
        ${variantStyles[t.variant ?? "default"]}
      `}
      role="alert"
    >
      <div className="flex-1 min-w-0">
        {t.title && <p className="text-sm font-semibold">{t.title}</p>}
        {t.description && (
          <p className="text-xs mt-0.5 opacity-80">{t.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 p-0.5 rounded-sm opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
