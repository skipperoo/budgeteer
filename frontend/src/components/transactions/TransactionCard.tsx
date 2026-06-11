/**
 * TransactionCard — a presentational component that renders a single
 * transaction's decrypted payload (amount, category, counterparty, date, notes).
 *
 * Handles the case where the payload could not be decrypted (shows a muted
 * "Could not decrypt" indicator instead of raw encrypted text).
 */

import { Button } from "@/components/ui/button";
import type { TransactionPayload } from "@/lib/crypto-transaction";

export interface TransactionDisplay {
  id: string;
  time: string;
  /** Present when decryption succeeded, null when it failed. */
  payload: TransactionPayload | null;
  /** If the transaction can't be decrypted, show a reason. */
  decryptError?: string;
}

interface TransactionCardProps {
  transaction: TransactionDisplay;
  currency?: string;
  /** Navigate to the account detail page on click. */
  onClick?: () => void;
  /** Show a delete button. */
  onDelete?: (id: string) => void;
  /** Indicates this card is in a "recent transactions" list (smaller). */
  compact?: boolean;
}

export function TransactionCard({
  transaction,
  onClick,
  onDelete,
  compact = false,
}: TransactionCardProps) {
  const { payload, time } = transaction;
  const isIncome = payload ? payload.amount >= 0 : null;

  const formattedAmount = payload
    ? `${isIncome ? "+" : ""}${payload.amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : null;

  return (
    <div
      className={`
        flex items-center justify-between rounded-lg border
        ${compact ? "p-2" : "p-3"}
        ${onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
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
      <div className="flex items-center gap-3 min-w-0">
        {/* Amount */}
        {payload ? (
          <span
            className={`${compact ? "text-xs" : "text-sm"} font-semibold tabular-nums ${
              isIncome ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"
            }`}
          >
            {formattedAmount}
          </span>
        ) : (
          <span className="text-xs font-mono text-muted-foreground italic">
            {transaction.decryptError ?? "Could not decrypt"}
          </span>
        )}

        {/* Category pill */}
        {payload?.category && (
          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full shrink-0">
            {payload.category}
          </span>
        )}

        {/* Counterparty */}
        {payload?.counterparty && (
          <span className="text-sm text-muted-foreground truncate hidden sm:inline">
            {payload.counterparty}
          </span>
        )}

        {/* Date */}
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {new Date(time).toLocaleDateString()}
        </span>

        {/* Notes */}
        {payload?.notes && (
          <span className="text-xs text-muted-foreground truncate hidden md:inline italic max-w-32">
            {payload.notes}
          </span>
        )}
      </div>

      {/* Delete button */}
      {onDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(transaction.id);
          }}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
