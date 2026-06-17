import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/lib/format";

interface BudgetProgressBarProps {
  /** Budget display name (plaintext label from budget form) */
  name: string;
  /** Current spent amount in currency units */
  current: number;
  /** Budget limit in currency units */
  max: number;
  /** Currency code */
  currency?: string;
  /** Compact variant for cards */
  compact?: boolean;
  /** Optional category to show as a pill badge */
  category?: string;
  /** Optional account label, e.g. "Checking" or "All Accounts" */
  accountLabel?: string;
  className?: string;
}

export function BudgetProgressBar({
  name,
  current,
  max,
  currency = "USD",
  compact = false,
  category,
  accountLabel,
  className,
}: BudgetProgressBarProps) {
  const ratio = max > 0 ? Math.min(current / max, 1) : 0;
  const percent = Math.round(ratio * 100);
  const symbol = getCurrencySymbol(currency);

  // Determine color based on progress
  const barColor =
    percent >= 100
      ? "bg-destructive"
      : percent >= 80
        ? "bg-amber-500"
        : percent >= 50
          ? "bg-income"
          : "bg-primary";

  // Minimum 2% so the bar is faintly visible at very low progress
  // but 0% when nothing has been spent
  const barWidth = `${percent === 0 ? 0 : Math.max(percent, 2)}%`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className={cn("flex items-center justify-between gap-2", compact ? "text-xs" : "text-sm")}>
        <span className="font-medium text-foreground truncate min-w-0 flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          {accountLabel && (
            <span className="text-muted-foreground/70 font-normal shrink-0">
              ({accountLabel})
            </span>
          )}
          {category && (
            <span className="text-[10px] uppercase font-bold tracking-wider bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded shrink-0">
              {category}
            </span>
          )}
        </span>
        <span className={cn("tabular-nums whitespace-nowrap shrink-0", percent >= 80 ? "text-destructive" : "text-muted-foreground")}>
          {symbol}{Math.abs(current).toFixed(2)} / {symbol}{max.toFixed(2)}
        </span>
      </div>
      <div className={cn("w-full bg-secondary rounded-full overflow-hidden", compact ? "h-2" : "h-3")}>
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: barWidth }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${name}: ${percent}% used`}
        />
      </div>
      <div className={cn("flex justify-between", compact ? "text-[10px]" : "text-xs")}>
        <span className={cn(
          "font-medium",
          percent >= 100 ? "text-destructive" : percent >= 80 ? "text-amber-600" : "text-muted-foreground"
        )}>
          {percent}% used
        </span>
        <span className="text-muted-foreground">
          {symbol}{(max - current).toFixed(2)} remaining
        </span>
      </div>
    </div>
  );
}
