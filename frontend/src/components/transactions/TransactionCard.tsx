/**
 * TransactionCard — a presentational component that renders a single
 * transaction's decrypted payload (amount, category, counterparty, date, notes).
 *
 * Handles the case where the payload could not be decrypted (shows a muted
 * "Could not decrypt" indicator instead of raw encrypted text).
 */

import { Button } from "@/components/ui/button";
import type { TransactionPayload } from "@/lib/crypto-transaction";
import { formatDate, formatCurrency } from "@/lib/format";
import { ArrowUpRight, ArrowDownLeft, Lock, Pencil, Trash2 } from "lucide-react";

export interface TransactionDisplay {
  id: string;
  time: string;
  account_id?: string;
  /** Present when decryption succeeded, null when it failed. */
  payload: TransactionPayload | null;
  /** If the transaction can't be decrypted, show a reason. */
  decryptError?: string;
}

interface TransactionCardProps {
  transaction: TransactionDisplay;
  /** The currency code (e.g., "USD", "EUR") */
  currency?: string;
  /** Navigate to the account detail page on click. */
  onClick?: () => void;
  /** Show a delete button. */
  onDelete?: (id: string) => void;
  /** Show an edit button. */
  onEdit?: (id: string) => void;
  /** Indicates this card is in a "recent transactions" list (smaller). */
  compact?: boolean;
}

export function TransactionCard({
  transaction,
  currency = "EUR", // Fallback to EUR if not provided
  onClick,
  onDelete,
  onEdit,
  compact = false,
}: TransactionCardProps) {
  const { payload, time } = transaction;
  const isIncome = payload ? payload.amount >= 0 : null;
  const totalAmount = payload ? payload.amount - (payload.commission || 0) : null;

  return (
    <div
      className={`
        group relative flex items-center justify-between rounded-xl border border-border bg-card 
        ${compact ? "p-3" : "p-4"}
        ${onClick ? "cursor-pointer hover:bg-accent/40 transition-all duration-200" : ""}
      `}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-center gap-4 min-w-0">
        {/* Type Icon */}
        <div 
          className={`
            flex items-center justify-center rounded-full shrink-0
            ${compact ? "h-8 w-8" : "h-10 w-10"}
            ${payload 
              ? isIncome 
                ? "bg-income/10 text-income" 
                : "bg-expense/10 text-expense"
              : "bg-muted text-muted-foreground"
            }
          `}
        >
          {payload ? (
            isIncome ? (
              <ArrowUpRight className={compact ? "h-4 w-4" : "h-5 w-5"} />
            ) : (
              <ArrowDownLeft className={compact ? "h-4 w-4" : "h-5 w-5"} />
            )
          ) : (
            <Lock className={compact ? "h-4 w-4" : "h-5 w-5"} />
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-foreground truncate leading-tight">
            {payload?.counterparty || (payload ? "Unknown Counterparty" : "Encrypted Transaction")}
          </span>
          <div className="flex items-center gap-2 mt-1">
            {payload?.category && (
              <span className="text-[10px] uppercase font-bold tracking-wider bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                {payload.category}
              </span>
            )}
            {payload?.notes && (
              <span className="text-xs text-muted-foreground truncate italic opacity-80">
                {payload.notes}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Amount and Date */}
        <div className="flex flex-col items-end shrink-0">
          {payload ? (
            <>
              <span
                className={`
                  ${compact ? "text-sm" : "text-base"} 
                  font-bold tabular-nums leading-none
                  ${isIncome ? "text-income" : "text-foreground"}
                `}
              >
                {formatCurrency(totalAmount!, currency, true)}
              </span>
              {payload.commission && payload.commission > 0 && (
                <span className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                  {formatCurrency(payload.commission, currency)} fee
                </span>
              )}
              {payload.interest_amount != null && payload.interest_amount > 0 && (
                <span className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                  {formatCurrency(payload.interest_amount, currency)} interest
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              {transaction.decryptError ?? "Decryption required"}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground mt-1.5 font-medium uppercase tracking-tight opacity-70">
            {formatDate(time, { month: "short", day: "numeric", year: compact ? undefined : "numeric" })}
          </span>
        </div>

        {/* Actions - only visible on hover if not compact or if they are explicitly passed */}
        {(onEdit || onDelete) && (
          <div className={`
            flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200
            ${compact ? "absolute -right-2 top-1/2 -translate-y-1/2 bg-card p-1 shadow-lg rounded-lg border border-border" : ""}
          `}>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(transaction.id);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Edit</span>
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(transaction.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">Delete</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
