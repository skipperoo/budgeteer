import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/lib/format";

interface BudgetProgressBarProps {
  label: string;
  current: number;      // spent amount in currency units
  max: number;          // budget limit in currency units
  currency?: string;
  compact?: boolean;    // smaller variant for cards
  className?: string;
}

export function BudgetProgressBar({
  label,
  current,
  max,
  currency = "USD",
  compact = false,
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

  const barWidth = `${Math.max(percent, 4)}%`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className={cn("flex items-center justify-between", compact ? "text-xs" : "text-sm")}>
        <span className="font-medium text-foreground truncate mr-2">{label}</span>
        <span className={cn("tabular-nums whitespace-nowrap", percent >= 80 ? "text-destructive" : "text-muted-foreground")}>
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
          aria-label={`${label}: ${percent}% used`}
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
